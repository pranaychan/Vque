import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getEntry, getPublicQueue, joinQueue, leaveQueue, getApiUrl } from "../api";

const STATUS_MESSAGES = {
    called: ["It's your turn!", "Please make your way to the restaurant team now."],
    serving: ["You're being served", "The restaurant has started serving your party."],
    completed: ["Visit complete", "Thanks for visiting. We hope to see you again soon."],
    skipped: ["Your turn was skipped", "Please speak with the restaurant team if you still need assistance."],
    cancelled: ["You left the queue", "You can join again if the queue is open."],
};

function GroupSizeSelect({ value, onChange }) {
    return (
        <select value={value} onChange={onChange}>
            {Array.from({ length: 20 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "person" : "people"}</option>
            ))}
        </select>
    );
}

function loadSavedSession(queueId) {
    const saved = localStorage.getItem(`vque_queue_session_${queueId}`);
    if (!saved) return null;
    try { return JSON.parse(saved); }
    catch { localStorage.removeItem(`vque_queue_session_${queueId}`); return null; }
}

function JoinQueue() {
    const { queueId } = useParams();
    const savedSession = loadSavedSession(queueId);
    const [queue, setQueue] = useState(null);
    const [name, setName] = useState("");
    const [groupSize, setGroupSize] = useState(2);
    const [step, setStep] = useState(savedSession ? "joined" : "details");
    const [entryId, setEntryId] = useState(savedSession?.entryId || null);
    const [sessionToken, setSessionToken] = useState(savedSession?.token || "");
    const [position, setPosition] = useState(null);
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [activeCount, setActiveCount] = useState(0);
    const [entryStatus, setEntryStatus] = useState("waiting");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const socketRef = useRef(null);

    async function loadQueue() {
        try { setQueue(await getPublicQueue(queueId)); }
        catch (err) { setError(err.message); }
    }

    useEffect(() => { loadQueue(); }, [queueId]);

    useEffect(() => {
        if (!entryId || !sessionToken) return;
        let fallbackTimer;
        const wsUrl = getApiUrl().replace(/^http/, "ws");
        const socket = new WebSocket(`${wsUrl}/queue-entries/ws/customer/${queueId}?token=${encodeURIComponent(sessionToken)}`);
        socketRef.current = socket;

        async function refreshEntry() {
            try {
                const data = await getEntry(entryId, sessionToken);
                setPosition(data.position);
                setPeopleAhead(data.people_ahead);
                setActiveCount(data.active_count);
                setEntryStatus(data.status);
                if (data.status !== "waiting") setStep("status");
            } catch (err) { setError(err.message); }
        }
        socket.onopen = refreshEntry;
        socket.onmessage = refreshEntry;
        socket.onerror = () => { if (!fallbackTimer) fallbackTimer = setInterval(refreshEntry, 15000); };
        socket.onclose = () => { if (!fallbackTimer) fallbackTimer = setInterval(refreshEntry, 15000); };
        return () => { if (fallbackTimer) clearInterval(fallbackTimer); socket.close(); socketRef.current = null; };
    }, [entryId, sessionToken, queueId]);

    async function completeJoin(event) {
        event.preventDefault();
        setError("");
        if (name.trim().length < 2) { setError("Enter your name."); return; }
        setLoading(true);
        try {
            const data = await joinQueue(queueId, { customer_name: name.trim(), group_size: Number(groupSize) });
            setEntryId(data.entry_id);
            setPosition(data.position);
            setPeopleAhead(data.people_ahead);
            setActiveCount(data.active_count);
            setSessionToken(data.queue_session_token);
            localStorage.setItem(`vque_queue_session_${queueId}`, JSON.stringify({ entryId: data.entry_id, token: data.queue_session_token }));
            setStep("joined");
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }

    async function handleLeave() {
        if (!entryId || !sessionToken) return;
        if (!window.confirm("Leave this queue? Your place cannot be restored.")) return;
        setLoading(true); setError("");
        try {
            await leaveQueue(entryId, sessionToken);
            localStorage.removeItem(`vque_queue_session_${queueId}`);
            setEntryId(null); setSessionToken(""); setStep("details"); setPosition(null);
            await loadQueue();
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }

    const [statusTitle, statusBody] = STATUS_MESSAGES[entryStatus] || ["Your status changed", "Please check with restaurant staff for the next step."];

    if (!queue) return <div className="customer-page"><div className="customer-card"><p>{error || "Loading queue..."}</p></div></div>;

    const queueClosed = queue.status !== "open" && !["joined", "status"].includes(step);

    return (
        <div className="customer-page">
            <div className="customer-card">
                <div className="customer-brand"><span>V</span> Vque</div>
                <div className="queue-hero">
                    <div className="queue-hero-icon">Q</div>
                    <p className="eyebrow">VIRTUAL QUEUE</p>
                    <h1>{queue.name}</h1>
                    <p>{queue.location_name} · {queue.city}</p>
                    <div className={`status ${queue.status}`}>{queue.status}</div>
                </div>
                {queueClosed ? (
                    <div className="customer-message"><h2>Queue is not accepting new customers</h2><p>Please try again when the queue opens.</p></div>
                ) : (
                    <>
                        {step === "details" && (
                            <form onSubmit={completeJoin} className="customer-form">
                                <h2>Join the queue</h2>
                                <p>No account, phone number or OTP required.</p>
                                <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength="100" autoFocus required /></label>
                                <label>Group size<GroupSizeSelect value={groupSize} onChange={(e) => setGroupSize(e.target.value)} /></label>
                                {error && <p className="form-error">{error}</p>}
                                <button className="customer-button" disabled={loading}>{loading ? "Joining..." : "Join queue"}</button>
                            </form>
                        )}
                        {step === "joined" && (
                            <div className="joined-state">
                                <div className="position-circle">{position || "–"}</div>
                                <p className="eyebrow">YOUR POSITION</p><h2>You're in the queue!</h2>
                                <p>{peopleAhead === 0 ? "You're next. Please stay nearby." : `${peopleAhead} ${peopleAhead === 1 ? "party is" : "parties are"} ahead of you.`}</p>
                                <div className="waiting-box"><span>Active parties in queue</span><strong>{activeCount || queue.active_count}</strong></div>
                                <button className="leave-button" disabled={loading} onClick={handleLeave}>Leave queue</button>
                            </div>
                        )}
                        {step === "status" && (
                            <div className="joined-state">
                                <p className="eyebrow">QUEUE UPDATE</p><h2>{statusTitle}</h2><p>{statusBody}</p>
                                {["waiting", "called", "serving"].includes(entryStatus) && <button className="leave-button" disabled={loading} onClick={handleLeave}>Leave queue</button>}
                            </div>
                        )}
                    </>
                )}
                <img className="customer-qr" src={`${getApiUrl()}/queues/${queue.id}/qr/public`} alt="Queue QR code" />
            </div>
        </div>
    );
}

export default JoinQueue;
