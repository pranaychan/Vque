import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { resendVerification, verifyEmail } from "../api";

function VerifyEmail() {
    const location = useLocation();
    const navigate = useNavigate();
    const initialEmail = new URLSearchParams(location.search).get("email") || "";

    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);
        try {
            await verifyEmail(email.trim().toLowerCase(), code);
            setMessage("Email verified. You can now sign in.");
            setTimeout(() => navigate("/login"), 900);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function resend() {
        setError("");
        setMessage("");
        try {
            const data = await resendVerification(email.trim().toLowerCase());
            setMessage(data.message);
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="brand-mark">V</div>
                <h1>Verify your email</h1>
                <p className="auth-subtitle">Enter the 6-digit code sent to your restaurant email.</p>

                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>

                    <div className="form-group">
                        <label>Verification code</label>
                        <input
                            inputMode="numeric"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            maxLength="6"
                            placeholder="000000"
                            required
                        />
                    </div>

                    {error && <p className="form-error">{error}</p>}
                    {message && <p className="form-success">{message}</p>}

                    <button className="auth-button" disabled={loading}>
                        {loading ? "Verifying..." : "Verify email"}
                    </button>
                </form>

                <button className="text-button" onClick={resend}>Resend code</button>
                <p className="auth-footer"><Link to="/login">Back to login</Link></p>
            </div>
        </div>
    );
}

export default VerifyEmail;
