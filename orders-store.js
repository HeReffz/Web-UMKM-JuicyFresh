(function () {
    const LOCAL_KEY = "orders";

    const cfg = window.JUICYFRESH_SYNC || {};
    const supabaseUrl = (cfg.supabaseUrl || "").replace(/\/$/, "");
    const supabaseAnonKey = cfg.supabaseAnonKey || "";
    const cloudEnabled = Boolean(supabaseUrl && supabaseAnonKey);

    function getLocalOrders() {
        return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
    }

    function setLocalOrders(orders) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(orders));
    }

    function headers(extra) {
        return {
            apikey: supabaseAnonKey,
            Authorization: "Bearer " + supabaseAnonKey,
            "Content-Type": "application/json",
            ...extra
        };
    }

    async function supabaseFetch(path, options) {
        const res = await fetch(supabaseUrl + path, options);
        if (!res.ok) {
            const text = await res.text();
            throw new Error("Supabase error " + res.status + ": " + text);
        }
        return res;
    }

    async function getOrders() {
        if (!cloudEnabled) return getLocalOrders();

        try {
            const res = await supabaseFetch(
                "/rest/v1/orders?select=*&order=id.desc",
                {
                    method: "GET",
                    headers: headers()
                }
            );
            const remoteOrders = await res.json();
            if (remoteOrders.length === 0) {
                const localOrders = getLocalOrders();
                if (localOrders.length > 0) {
                    await supabaseFetch("/rest/v1/orders", {
                        method: "POST",
                        headers: headers({ Prefer: "return=representation" }),
                        body: JSON.stringify(localOrders)
                    });
                    return [...localOrders].reverse();
                }
            }
            return remoteOrders;
        } catch (err) {
            console.warn("Cloud read failed, fallback to local storage.", err);
            return getLocalOrders();
        }
    }

    async function addOrder(order) {
        if (!cloudEnabled) {
            const orders = getLocalOrders();
            orders.push(order);
            setLocalOrders(orders);
            return;
        }

        try {
            await supabaseFetch("/rest/v1/orders", {
                method: "POST",
                headers: headers({ Prefer: "return=representation" }),
                body: JSON.stringify(order)
            });
        } catch (err) {
            console.warn("Cloud write failed, fallback to local storage.", err);
            const orders = getLocalOrders();
            orders.push(order);
            setLocalOrders(orders);
        }
    }

    async function updateOrderStatus(id, status) {
        if (!cloudEnabled) {
            const orders = getLocalOrders();
            const idx = orders.findIndex((o) => o.id == id);
            if (idx !== -1) {
                orders[idx].status = status;
                setLocalOrders(orders);
            }
            return;
        }

        try {
            await supabaseFetch("/rest/v1/orders?id=eq." + encodeURIComponent(id), {
                method: "PATCH",
                headers: headers({ Prefer: "return=representation" }),
                body: JSON.stringify({ status: status })
            });
        } catch (err) {
            console.warn("Cloud update failed, fallback to local storage.", err);
            const orders = getLocalOrders();
            const idx = orders.findIndex((o) => o.id == id);
            if (idx !== -1) {
                orders[idx].status = status;
                setLocalOrders(orders);
            }
        }
    }

    async function clearOrders() {
        if (!cloudEnabled) {
            localStorage.removeItem(LOCAL_KEY);
            return;
        }

        try {
            await supabaseFetch("/rest/v1/orders?id=not.is.null", {
                method: "DELETE",
                headers: headers()
            });
        } catch (err) {
            console.warn("Cloud clear failed, fallback to local storage.", err);
            localStorage.removeItem(LOCAL_KEY);
        }
    }

    function getStorageModeLabel() {
        return cloudEnabled ? "cloud" : "local";
    }

    window.orderStore = {
        getOrders,
        addOrder,
        updateOrderStatus,
        clearOrders,
        getStorageModeLabel,
        cloudEnabled
    };
})();
