import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getEntry, getPublicQueue, joinQueue, leaveQueue, sendOtp, verifyOtp, getApiUrl } from "../api";

const STATUS_MESSAGES = {
    called: ["It's your turn!", "Please make your way to the restaurant team now."],
    serving: ["You're being served", "The restaurant has started serving your party."],
    completed: ["Visit complete", "Thanks for visiting. We hope to see you again soon."],
    skipped: ["Your turn was skipped", "Please speak with the restaurant team if you still need assistance."],
    cancelled: ["You left the queue", "You can join again if the queue is open."],
};

// Shared by both the phone-verified and guest join forms so the list of
// group sizes only has to be written once.
function GroupSizeSelect({ value, onChange }) {
    return (
        <select value={value} onChange={onChange}>
            {Array.from({ length: 20 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "person" : "people"}</option>
            ))}
        </select>
    );
}

// Reads a previously saved queue session (set after joining) so a customer
// who reopens the page picks up where they left off, instead of joining again.
function loadSavedSession(queueId) {
    const saved = localStorage.getItem(`vque_queue_session_${queueId}`);
    if (!saved) return null;
    try {
        return JSON.parse(saved);
    } catch {
        localStorage.removeItem(`vque_queue_session_${queueId}`);
        return null;
    }
}

function JoinQueue() {
    const { queueId } = useParams();
    const savedSession = loadSavedSession(queueId);

    const [queue, setQueue] = useState(null);
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [guestName, setGuestName] = useState("");
    const [groupSize, setGroupSize] = useState(2);
    const [otp, setOtp] = useState("");
    const [step, setStep] = useState(savedSession ? "joined" : "details");
    const [verificationToken, setVerificationToken] = useState(savedSession?.token || "");
    const [entryId, setEntryId] = useState(savedSession?.entryId || null);
    const [position, setPosition] = useState(null);
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [activeCount, setActiveCount] = useState(0);
    const [entryStatus, setEntryStatus] = useState("waiting");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        loadQueue();
    }, [queueId]);

    // Once joined, keep the customer's position live over a WebSocket, with a
    // slow polling fallback if the socket cannot connect or gets dropped.
    useEffect(() => {
        if (!entryId || !verificationToken) return;
        let fallbackTimer;
        const wsUrl = getApiUrl().replace(/^http/, "ws");
        const socket = new WebSocket(`${wsUrl}/queue-entries/ws/customer/${queueId}?token=${encodeURIComponent(verificationToken)}`);
        socketRef.current = socket;

        async function refreshEntry() {
            try {
                const data = await getEntry(entryId, verificationToken);
                setPosition(data.position);
                setPeopleAhead(data.people_ahead);
                setActiveCount(data.active_count);
                setEntryStatus(data.status);
                if (data.status !== "waiting") setStep("status");
                await loadQueue();
            } catch (err) {
                setError(err.message);
            }
        }

        socket.onopen = refreshEntry;
        socket.onmessage = refreshEntry;
        socket.onerror = () => {
            if (!fallbackTimer) fallbackTimer = setInterval(refreshEntry, 15000);
        };
        socket.onclose = () => {
            if (!fallbackTimer) fallbackTimer = setInterval(refreshEntry, 15000);
        };

        return () => {
            if (fallbackTimer) clearInterval(fallbackTimer);
            socket.close();
            socketRef.current = null;
        };
    }, [entryId, verificationToken, queueId]);

    async function loadQueue() {
        try {
            setQueue(await getPublicQueue(queueId));
        } catch (err) {
            setError(err.message);
        }
    }

    async function requestOtp(event) {
        event.preventDefault();
        setError("");
        if (!/^[6-9][0-9]{9}$/.test(phone)) {
            setError("Enter a valid 10-digit Indian mobile number.");
            return;
        }
        setLoading(true);
        try {
            await sendOtp(phone);
            setStep("otp");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function verifyPhone(event) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const data = await verifyOtp(phone, otp);
            setVerificationToken(data.verification_token);
            setStep("join");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    // Shared by the phone-verified join form and the guest join form: they
    // only differ in whose name is used and whether phone/OTP data is sent.
    async function completeJoin(event, isGuest) {
        event.preventDefault();
        setError("");
        const customerName = (isGuest ? guestName : name).trim();
        if (customerName.length < 2) {
            setError("Enter your name.");
            return;
        }
        setLoading(true);
        try {
            const data = await joinQueue(queueId, {
                customer_name: customerName,
                phone_number: isGuest ? null : phone,
                group_size: Number(groupSize),
                verification_token: isGuest ? null : verificationToken,
                guest_mode: isGuest,
            });
            setEntryId(data.entry_id);
            setPosition(data.position);
            setPeopleAhead(data.people_ahead);
            setActiveCount(data.active_count);
            setVerificationToken(data.queue_session_token);
            localStorage.setItem(
                `vque_queue_session_${queueId}`,
                JSON.stringify({ entryId: data.entry_id, token: data.queue_session_token })
            );
            setStep("joined");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleLeave() {
        if (!entryId || !verificationToken) return;
        if (!window.confirm("Leave this queue? Your place cannot be restored.")) return;
        setLoading(true);
        setError("");
        try {
            await leaveQueue(entryId, verificationToken);
            localStorage.removeItem(`vque_queue_session_${queueId}`);
            setEntryId(null);
            setVerificationToken("");
            setStep("details");
            await loadQueue();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const [statusTitle, statusBody] = STATUS_MESSAGES[entryStatus] || [
        "Your status changed",
        "Please check with restaurant staff for the next step.",
    ];

    if (!queue) {
        return (
            <div className="customer-page">
                <div className="customer-card"><p>{error || "Loading queue..."}</p></div>
            </div>
        );
    }

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
                    <div className="customer-message">
                        <h2>Queue is not accepting new customers</h2>
                        <p>Please try again when the queue opens.</p>
                    </div>
                ) : (
                    <>
                        {step === "details" && (
                            <form onSubmit={requestOtp} className="customer-form">
                                <h2>Verify your phone</h2>
                                <p>We'll send a one-time code to confirm your place.</p>
                                <label>
                                    Mobile number
                                    <input
                                        inputMode="numeric"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                                        placeholder="10-digit mobile number"
                                        required
                                    />
                                </label>
                                {error && <p className="form-error">{error}</p>}
                                <button className="customer-button" disabled={loading}>
                                    {loading ? "Sending code..." : "Send OTP"}
                                </button>
                            </form>
                        )}

                        {step === "details" && (
                            <div className="guest-option">
                                <span>Just visiting?</span>
                                <button
                                    type="button"
                                    className="text-button guest-button"
                                    onClick={() => { setError(""); setStep("guest"); }}
                                >
                                    Continue as guest
                                </button>
                                <small>No phone number or account required.</small>
                            </div>
                        )}

                        {step === "guest" && (
                            <form onSubmit={(e) => completeJoin(e, true)} className="customer-form">
                                <h2>Join as a guest</h2>
                                <p>No account or phone verification required. You can still track your place on this device.</p>
                                <label>
                                    Your name
                                    <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength="100" required />
                                </label>
                                <label>
                                    Group size
                                    <GroupSizeSelect value={groupSize} onChange={(e) => setGroupSize(e.target.value)} />
                                </label>
                                {error && <p className="form-error">{error}</p>}
                                <button className="customer-button" disabled={loading}>
                                    {loading ? "Joining..." : "Join as guest"}
                                </button>
                                <button type="button" className="text-button" onClick={() => { setError(""); setStep("details"); }}>
                                    Use phone verification instead
                                </button>
                            </form>
                        )}

                        {step === "otp" && (
                            <form onSubmit={verifyPhone} className="customer-form">
                                <h2>Enter verification code</h2>
                                <p>Enter the code provided for +91 {phone}</p>
                                <label>
                                    6-digit OTP
                                    <input
                                        inputMode="numeric"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        placeholder="000000"
                                        maxLength="6"
                                        required
                                    />
                                </label>
                                {error && <p className="form-error">{error}</p>}
                                <button className="customer-button" disabled={loading}>
                                    {loading ? "Verifying..." : "Verify phone"}
                                </button>
                            </form>
                        )}

                        {step === "join" && (
                            <form onSubmit={(e) => completeJoin(e, false)} className="customer-form">
                                <h2>Join the queue</h2>
                                <p>Your phone is verified. Tell us who is waiting.</p>
                                <label>
                                    Your name
                                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength="100" required />
                                </label>
                                <label>
                                    Group size
                                    <GroupSizeSelect value={groupSize} onChange={(e) => setGroupSize(e.target.value)} />
                                </label>
                                {error && <p className="form-error">{error}</p>}
                                <button className="customer-button" disabled={loading}>
                                    {loading ? "Joining..." : "Join queue"}
                                </button>
                            </form>
                        )}

                        {step === "joined" && (
                            <div className="joined-state">
                                <div className="position-circle">{position || "–"}</div>
                                <p className="eyebrow">YOUR POSITION</p>
                                <h2>You're in the queue!</h2>
                                <p>
                                    {peopleAhead === 0
                                        ? "You're next. Please stay nearby."
                                        : `${peopleAhead} ${peopleAhead === 1 ? "party is" : "parties are"} ahead of you.`}
                                </p>
                                <div className="waiting-box">
                                    <span>Active parties in queue</span>
                                    <strong>{activeCount || queue.active_count}</strong>
                                </div>
                                <button className="leave-button" disabled={loading} onClick={handleLeave}>Leave queue</button>
                            </div>
                        )}

                        {step === "status" && (
                            <div className="joined-state">
                                <p className="eyebrow">QUEUE UPDATE</p>
                                <h2>{statusTitle}</h2>
                                <p>{statusBody}</p>
                                {["waiting", "called", "serving"].includes(entryStatus) && (
                                    <button className="leave-button" disabled={loading} onClick={handleLeave}>Leave queue</button>
                                )}
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
