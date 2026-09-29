import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    createLocation,
    createQueue,
    deleteLocation,
    deleteQueue,
    getApiUrl,
    getDashboardLocations,
    getManageQueueEntries,
    getRestaurant,
    updateLocationStatus,
    updateQueueEntry,
    updateQueueStatus
} from "../api";

function Dashboard() {
    const [restaurant, setRestaurant] = useState(null);
    const [locations, setLocations] = useState([]);
    const [selectedLocationId, setSelectedLocationId] = useState(null);
    const [selectedQueueId, setSelectedQueueId] = useState(null);
    const [entries, setEntries] = useState([]);
    const [events, setEvents] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [locationForm, setLocationForm] = useState(false);
    const [queueForm, setQueueForm] = useState(false);
    const [locationData, setLocationData] = useState({ name: "", address: "", city: "" });
    const [queueName, setQueueName] = useState("");
    const [qrOpen, setQrOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const socketRef = useRef(null);
    const navigate = useNavigate();
    const demoMode = localStorage.getItem("demo_mode") === "true";

    const selectedLocation = locations.find((item) => item.id === selectedLocationId) || null;
    const selectedQueue = selectedLocation?.queues.find((item) => item.id === selectedQueueId) || null;

    const totalQueues = useMemo(
        () => locations.reduce((total, location) => total + location.queues.length, 0),
        [locations]
    );
    const totalWaiting = useMemo(
        () => locations.reduce((total, location) => total + location.queues.reduce((sum, queue) => sum + queue.entriesCount, 0), 0),
        [locations]
    );

    async function loadDashboard() {
        try {
            setLoading(true);
            const [restaurantData, dashboardLocations] = await Promise.all([
                getRestaurant(),
                getDashboardLocations(),
            ]);
            setRestaurant(restaurantData);
            setLocations(dashboardLocations);
            const nextLocationId = selectedLocationId || dashboardLocations[0]?.id || null;
            const location = dashboardLocations.find((item) => item.id === nextLocationId) || dashboardLocations[0];
            const nextQueueId = selectedQueueId || location?.queues[0]?.id || null;
            setSelectedLocationId(nextLocationId);
            setSelectedQueueId(nextQueueId);
            if (nextQueueId) setEntries(await getManageQueueEntries(nextQueueId));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function refreshSelectedQueue() {
        if (!selectedQueueId) return;
        try {
            const data = await getManageQueueEntries(selectedQueueId);
            setEntries(data);
            setLocations((current) => current.map((location) => ({
                ...location,
                queues: location.queues.map((queue) => queue.id === selectedQueueId ? { ...queue, entriesCount: data.length } : queue)
            })));
        } catch (err) {
            setError(err.message);
        }
    }

    function addEvent(message) {
        setEvents((current) => [{ message, time: new Date().toLocaleTimeString() }, ...current].slice(0, 12));
    }

    function connectWebSocket(queueId) {
        socketRef.current?.close();
        const wsUrl = getApiUrl().replace(/^http/, "ws");
        const token = localStorage.getItem("access_token") || "";
        const socket = new WebSocket(`${wsUrl}/queue-entries/ws/${queueId}?token=${encodeURIComponent(token)}`);
        socketRef.current = socket;

        socket.onopen = () => addEvent("Live feed connected");
        socket.onmessage = async (message) => {
            const data = JSON.parse(message.data);
            addEvent(`${data.action || "Queue"} update received`);
            await refreshSelectedQueue();
        };
        socket.onclose = () => addEvent("Live feed disconnected");
    }

    // These run after loadDashboard/connectWebSocket above so the effects
    // below can reference them.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount pattern
        loadDashboard();
        return () => socketRef.current?.close();
    }, []);

    useEffect(() => {
        if (!selectedQueueId) return;
        connectWebSocket(selectedQueueId);
        return () => socketRef.current?.close();
    }, [selectedQueueId]);

    function selectLocation(location) {
        setSelectedLocationId(location.id);
        setSelectedQueueId(location.queues[0]?.id || null);
        setEntries([]);
    }

    async function selectQueue(queue) {
        setSelectedQueueId(queue.id);
        try {
            setEntries(await getManageQueueEntries(queue.id));
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleCreateLocation(event) {
        event.preventDefault();
        try {
            const created = await createLocation(locationData);
            setLocations((current) => [...current, { ...created, queues: [] }]);
            setSelectedLocationId(created.id);
            setLocationData({ name: "", address: "", city: "" });
            setLocationForm(false);
        } catch (err) {
            setError(err.message);
        }
    }

    async function changeLocationStatus(location) {
        const nextStatus = location.status === "paused" ? "open" : "paused";
        try {
            setLocations((current) => current.map((item) => item.id === location.id ? { ...item, status: nextStatus } : item));
            const updated = await updateLocationStatus(location.id, nextStatus);
            setLocations((current) => current.map((item) => item.id === updated.id ? { ...item, status: updated.status } : item));
            addEvent(`Location ${nextStatus}`);
        } catch (err) {
            setLocations((current) => current.map((item) => item.id === location.id ? { ...item, status: location.status } : item));
            setError(err.message);
        }
    }

    async function handleDeleteLocation(location) {
        if (!window.confirm(`Delete "${location.name}"? This will also delete all queues and queue entries at this location.`)) return;

        try {
            await deleteLocation(location.id);
            const remaining = locations.filter((item) => item.id !== location.id);
            setLocations(remaining);

            if (selectedLocationId === location.id) {
                const nextLocation = remaining[0] || null;
                setSelectedLocationId(nextLocation?.id || null);
                setSelectedQueueId(nextLocation?.queues[0]?.id || null);
                setEntries([]);
            }
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleDeleteQueue(queue) {
        if (!window.confirm(`Delete "${queue.name}"? All customers currently in this queue will also be removed.`)) return;

        try {
            await deleteQueue(queue.id);
            const updatedLocations = locations.map((location) => ({
                ...location,
                queues: location.queues.filter((item) => item.id !== queue.id),
            }));
            setLocations(updatedLocations);

            if (selectedQueueId === queue.id) {
                const location = updatedLocations.find((item) => item.id === selectedLocationId);
                const nextQueue = location?.queues[0] || null;
                setSelectedQueueId(nextQueue?.id || null);
                setEntries([]);
                setQrOpen(false);
            }
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleCreateQueue(event) {
        event.preventDefault();
        if (!selectedLocation) return;
        try {
            const created = await createQueue(selectedLocation.id, { name: queueName });
            const newQueue = { ...created, entriesCount: 0 };
            setLocations((current) => current.map((location) =>
                location.id === selectedLocation.id ? { ...location, queues: [...location.queues, newQueue] } : location
            ));
            setSelectedQueueId(created.id);
            setEntries([]);
            setQueueName("");
            setQueueForm(false);
        } catch (err) {
            setError(err.message);
        }
    }

    async function changeStatus(nextStatus) {
        if (!selectedQueue || selectedQueue.status === nextStatus) return;
        try {
            const updated = await updateQueueStatus(selectedQueue.id, nextStatus);
            setLocations((current) => current.map((location) => ({
                ...location,
                queues: location.queues.map((queue) => queue.id === updated.id ? { ...queue, status: updated.status } : queue)
            })));
            addEvent(`Queue ${nextStatus}`);
        } catch (err) {
            setError(err.message);
        }
    }

    async function entryAction(entryId, action) {
        try {
            setActionLoading(true);
            await updateQueueEntry(selectedQueue.id, entryId, action);
            await refreshSelectedQueue();
            addEvent(`Customer action: ${action}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function shareQueue() {
        const url = `${window.location.origin}/join/${selectedQueue.id}`;
        try {
            if (navigator.share) await navigator.share({ title: selectedQueue.name, text: `Join ${selectedQueue.name} on Vque`, url });
            else await navigator.clipboard.writeText(url);
        } catch {
            setError("Unable to share the queue link.");
        }
    }

    function logout() {
        localStorage.removeItem("access_token");
        navigate("/login");
    }

    function exitDemo() {
        localStorage.removeItem("access_token");
        localStorage.removeItem("demo_mode");
        navigate("/");
    }

    if (loading) return <div className="dashboard-loading">Loading your workspace...</div>;

    return (
        <div className="dashboard-shell">
            <aside className="sidebar">
                <div className="sidebar-brand"><span>V</span> Vque</div>
                <div className="sidebar-label">WORKSPACE</div>
                <button className="sidebar-link active">Dashboard</button>
                <div className="sidebar-spacer" />
                <button className="sidebar-link" onClick={logout}>Sign out</button>
            </aside>

            <main className="dashboard-main">
                {demoMode && (
                    <div className="demo-banner">
                        <div>
                            <strong>Live demo mode</strong>
                            <span>Explore the dashboard with sample data. Changes are temporary and the demo resets when a new demo session starts.</span>
                        </div>
                        <button onClick={exitDemo}>Exit demo</button>
                    </div>
                )}

                <header className="topbar">
                    <div>
                        <p className="eyebrow">RESTAURANT OPERATIONS</p>
                        <h1>{restaurant?.name || "Vque"}</h1>
                    </div>
                    <div className="live-pill"><span /> Live system</div>
                </header>

                {error && <div className="alert" onClick={() => setError("")}>{error} <b>×</b></div>}

                <section className="stats-grid">
                    <div className="stat-card"><span>Locations</span><strong>{locations.length}<small>/3</small></strong><em>Free plan</em></div>
                    <div className="stat-card"><span>Active queues</span><strong>{totalQueues}<small>/9</small></strong><em>Across all locations</em></div>
                    <div className="stat-card"><span>People waiting</span><strong>{totalWaiting}</strong><em>Live count</em></div>
                    <div className="stat-card"><span>System status</span><strong className="online">Online</strong><em>Realtime connected</em></div>
                </section>

                <section className="workspace-grid">
                    <div className="panel locations-panel">
                        <div className="panel-title">
                            <div>
                                <p className="eyebrow">YOUR LOCATIONS</p>
                                <h2>Locations</h2>
                            </div>
                            <button className="icon-button" onClick={() => setLocationForm(!locationForm)}>+</button>
                        </div>

                        {locationForm && (
                            <form className="inline-form" onSubmit={handleCreateLocation}>
                                <input
                                    placeholder="Location name"
                                    value={locationData.name}
                                    onChange={(e) => setLocationData({ ...locationData, name: e.target.value })}
                                    maxLength="100"
                                    required
                                />
                                <input
                                    placeholder="Address"
                                    value={locationData.address}
                                    onChange={(e) => setLocationData({ ...locationData, address: e.target.value })}
                                    maxLength="255"
                                    required
                                />
                                <input
                                    placeholder="City"
                                    value={locationData.city}
                                    onChange={(e) => setLocationData({ ...locationData, city: e.target.value })}
                                    maxLength="100"
                                    required
                                />
                                <button className="primary-button">Create location</button>
                            </form>
                        )}

                        <div className="location-list">
                            {locations.map((location) => (
                                <div
                                    key={location.id}
                                    className={`location-card ${selectedLocationId === location.id ? "selected" : ""}`}
                                >
                                    <button className="location-card-main" onClick={() => selectLocation(location)}>
                                        <div className="location-avatar">{location.name.charAt(0).toUpperCase()}</div>
                                        <div><strong>{location.name}</strong><span>{location.city}</span></div>
                                        <b>{location.queues.length}</b>
                                    </button>
                                    <div className="location-actions">
                                        <button className="secondary-button" onClick={() => changeLocationStatus(location)}>
                                            {location.status === "paused" ? "Resume" : "Pause"}
                                        </button>
                                        <button className="delete-button" onClick={() => handleDeleteLocation(location)} title="Delete location" aria-label={`Delete ${location.name}`}>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="panel queue-panel">
                        {!selectedLocation ? (
                            <div className="empty-state">
                                <h2>No locations yet</h2>
                                <p>Create your first location to start managing queues.</p>
                            </div>
                        ) : (
                            <>
                                <div className="panel-title">
                                    <div>
                                        <p className="eyebrow">LOCATION</p>
                                        <h2>{selectedLocation.name}</h2>
                                        <span className="muted">{selectedLocation.address}, {selectedLocation.city} · {selectedLocation.status}</span>
                                    </div>
                                    <button
                                        className="primary-button"
                                        onClick={() => setQueueForm(!queueForm)}
                                        disabled={selectedLocation.queues.length >= 3}
                                    >
                                        + Add queue
                                    </button>
                                </div>

                                {queueForm && (
                                    <form className="inline-form horizontal" onSubmit={handleCreateQueue}>
                                        <input
                                            placeholder="Queue name"
                                            value={queueName}
                                            onChange={(e) => setQueueName(e.target.value)}
                                            maxLength="100"
                                            required
                                        />
                                        <button className="primary-button">Create</button>
                                    </form>
                                )}

                                <div className="queue-tabs">
                                    {selectedLocation.queues.map((queue) => (
                                        <button
                                            key={queue.id}
                                            className={`queue-tab ${selectedQueueId === queue.id ? "selected" : ""}`}
                                            onClick={() => selectQueue(queue)}
                                        >
                                            <span className="queue-dot" />{queue.name}<b>{queue.entriesCount}</b>
                                        </button>
                                    ))}
                                </div>

                                {selectedQueue && (
                                    <div className="queue-toolbar">
                                        <div>
                                            <h3>{selectedQueue.name}</h3>
                                            <span className={`status ${selectedQueue.status}`}>{selectedQueue.status}</span>
                                        </div>
                                        <div className="toolbar-actions">
                                            {selectedQueue.status === "open" && (
                                                <button className="secondary-button" onClick={() => changeStatus("paused")}>Pause queue</button>
                                            )}
                                            {selectedQueue.status === "paused" && (
                                                <button className="secondary-button" onClick={() => changeStatus("open")}>Resume queue</button>
                                            )}
                                            {selectedQueue.status !== "closed" ? (
                                                <button className="secondary-button" onClick={() => changeStatus("closed")}>Close queue</button>
                                            ) : (
                                                <button className="secondary-button" onClick={() => changeStatus("open")}>Open queue</button>
                                            )}
                                            <button className="secondary-button" onClick={() => setQrOpen(true)}>QR code</button>
                                            <button className="secondary-button" onClick={shareQueue}>Share</button>
                                            <button className="delete-button" onClick={() => handleDeleteQueue(selectedQueue)}>Delete queue</button>
                                        </div>
                                    </div>
                                )}

                                {selectedQueue && (
                                    <div className="entries">
                                        <div className="entries-head">
                                            <span>POSITION</span><span>CUSTOMER</span><span>GROUP</span><span>JOINED</span><span>ACTION</span>
                                        </div>
                                        {entries.length === 0 ? (
                                            <div className="empty-state compact">
                                                <h3>Queue is empty</h3>
                                                <p>New customers will appear here instantly.</p>
                                            </div>
                                        ) : (
                                            entries.map((entry, index) => (
                                                <div className="entry" key={entry.id}>
                                                    <strong className="position">{index + 1}</strong>
                                                    <div className="customer">
                                                        <div className="customer-avatar">{entry.customer_name.charAt(0).toUpperCase()}</div>
                                                        <div>
                                                            <strong>{entry.customer_name}</strong>
                                                            <span>{entry.is_guest ? "Guest" : "Verified customer"}</span>
                                                        </div>
                                                    </div>
                                                    <span>{entry.group_size} {entry.group_size === 1 ? "person" : "people"}</span>
                                                    <span>{new Date(entry.joined_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                                    <div className="entry-actions">
                                                        {entry.status === "waiting" && (
                                                            <button disabled={actionLoading} onClick={() => entryAction(entry.id, "call")}>Call</button>
                                                        )}
                                                        {entry.status === "called" && (
                                                            <button disabled={actionLoading} onClick={() => entryAction(entry.id, "serve")}>Serve</button>
                                                        )}
                                                        {entry.status === "serving" && (
                                                            <button disabled={actionLoading} onClick={() => entryAction(entry.id, "complete")}>Done</button>
                                                        )}
                                                        {(entry.status === "waiting" || entry.status === "called") && (
                                                            <button disabled={actionLoading} onClick={() => entryAction(entry.id, "skip")}>Skip</button>
                                                        )}
                                                        <button disabled={actionLoading} className="danger" onClick={() => entryAction(entry.id, "cancel")}>×</button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>

                <section className="feed-panel panel">
                    <div className="panel-title">
                        <div>
                            <p className="eyebrow">REALTIME</p>
                            <h2>Live queue feed</h2>
                        </div>
                        <span className="feed-live"><span /> Updating automatically</span>
                    </div>
                    <div className="feed-list">
                        {events.length === 0 ? (
                            <p className="muted">Waiting for live queue activity...</p>
                        ) : (
                            events.map((event, index) => (
                                <div className="feed-item" key={`${event.time}-${index}`}>
                                    <span className="feed-dot" /><span>{event.message}</span><time>{event.time}</time>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </main>

            {qrOpen && selectedQueue && (
                <div className="modal-backdrop" onClick={() => setQrOpen(false)}>
                    <div className="qr-modal" onClick={(event) => event.stopPropagation()}>
                        <button className="modal-close" onClick={() => setQrOpen(false)}>×</button>
                        <p className="eyebrow">CUSTOMER ACCESS</p>
                        <h2>{selectedQueue.name}</h2>
                        <p>Scan this QR code to join the queue.</p>
                        <img src={`${getApiUrl()}/queues/${selectedQueue.id}/qr/public`} alt={`QR code for ${selectedQueue.name}`} />
                        <div className="qr-actions">
                            <a
                                className="primary-button"
                                href={`${getApiUrl()}/queues/${selectedQueue.id}/qr/public`}
                                download={`vque-queue-${selectedQueue.id}.png`}
                            >
                                Download QR
                            </a>
                            <button className="secondary-button" onClick={shareQueue}>Share link</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
