import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api";

function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);
        try {
            const data = await forgotPassword(email.trim().toLowerCase());
            setMessage(data.message);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="brand-mark">V</div>
                <h1>Reset your password</h1>
                <p className="auth-subtitle">Enter your restaurant email and we'll send a reset link.</p>

                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>

                    {error && <p className="form-error">{error}</p>}
                    {message && <p className="form-success">{message}</p>}

                    <button className="auth-button" disabled={loading}>
                        {loading ? "Sending..." : "Send reset link"}
                    </button>
                </form>

                <p className="auth-footer"><Link to="/login">Back to login</Link></p>
            </div>
        </div>
    );
}

export default ForgotPassword;
