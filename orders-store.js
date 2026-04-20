(function () {
    const LOCAL_KEY = "orders";

    const cfg = window.JUICYFRESH_SYNC || {};
    const firebaseCfg = cfg.firebase || {};
    const firebaseConfigured = Boolean(firebaseCfg.apiKey && firebaseCfg.projectId && firebaseCfg.appId);

    let db = null;
    if (firebaseConfigured && window.firebase) {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseCfg);
            }
            db = firebase.firestore();
        } catch (err) {
            console.warn("Firebase init failed, fallback to local storage.", err);
        }
    }

    const cloudEnabled = Boolean(db);

    function getLocalOrders() {
        return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
    }

    function setLocalOrders(orders) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(orders));
    }

    function normalizeOrder(record) {
        return {
            id: String(record.id),
            nama: record.nama || "",
            hp: record.hp || "",
            jus: record.jus || "",
            jumlah: Number(record.jumlah || 0),
            catatan: record.catatan || "",
            status: record.status || "Pre-Order",
            created_at: record.created_at || Number(record.id) || Date.now()
        };
    }

    function sortByCreatedDesc(orders) {
        return [...orders].sort((a, b) => Number(b.created_at || b.id || 0) - Number(a.created_at || a.id || 0));
    }

    async function getOrders() {
        if (!cloudEnabled) return getLocalOrders();

        try {
            const snap = await db.collection("orders").orderBy("created_at", "desc").get();
            if (snap.empty) {
                const localOrders = getLocalOrders();
                if (localOrders.length > 0) {
                    const batch = db.batch();
                    localOrders.forEach((item) => {
                        const order = normalizeOrder(item);
                        batch.set(db.collection("orders").doc(order.id), order);
                    });
                    await batch.commit();
                    return sortByCreatedDesc(localOrders.map(normalizeOrder));
                }
            }

            return snap.docs.map((doc) => normalizeOrder({ id: doc.id, ...doc.data() }));
        } catch (err) {
            console.warn("Cloud read failed, fallback to local storage.", err);
            return getLocalOrders();
        }
    }

    async function addOrder(order) {
        if (!cloudEnabled) {
            const orders = getLocalOrders();
            orders.push(normalizeOrder(order));
            setLocalOrders(orders);
            return;
        }

        try {
            const payload = normalizeOrder(order);
            await db.collection("orders").doc(payload.id).set(payload);
        } catch (err) {
            console.warn("Cloud write failed, fallback to local storage.", err);
            const orders = getLocalOrders();
            orders.push(normalizeOrder(order));
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
            await db.collection("orders").doc(String(id)).update({ status: status });
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
            const snap = await db.collection("orders").get();
            const batch = db.batch();
            snap.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
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
