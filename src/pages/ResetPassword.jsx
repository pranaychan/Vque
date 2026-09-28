import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { resetPassword } from "../api";
import { getPasswordChecks } from "../passwordChecks";

function ResetPassword() {
    const location = useLocation();
    const navigate = useNavigate();
    const token = new URLSearchParams(location.search).get("token") || "";

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const checks = useMemo(() => getPasswordChecks(password), [password]);
    const strong = Object.values(checks).every(Boolean);

    async function submit(event) {
        event.preventDefault();
        setError("");
        if (!token) return setError("Reset link is missing or invalid.");
        if (!strong) return setError("Please meet all password security requirements.");
        if (password !== confirm) return setError("Passwords do not match.");

        setLoading(true);
        try {
            await resetPassword(token, password);
            setMessage("Password reset successfully. You can now sign in.");
            setTimeout(() => navigate("/login"), 900);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card auth-card-wide">
                <div className="brand-mark">V</div>
                <h1>Choose a new password</h1>
                <p className="auth-subtitle">Use a strong password to protect your restaurant account.</p>

                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>New password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            maxLength="64"
                            required
                        />
                    </div>

                    {password && (
                        <div className="password-checks">
                            <span className={checks.length ? "valid" : "invalid"}>8+ characters</span>
                            <span className={checks.upper ? "valid" : "invalid"}>Uppercase</span>
                            <span className={checks.lower ? "valid" : "invalid"}>Lowercase</span>
                            <span className={checks.number ? "valid" : "invalid"}>Number</span>
                            <span className={checks.special ? "valid" : "invalid"}>Special character</span>
                            <span className={checks.repeat ? "valid" : "invalid"}>No repeated characters</span>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Confirm password</label>
                        <input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            maxLength="64"
                            required
                        />
                    </div>

                    {error && <p className="form-error">{error}</p>}
                    {message && <p className="form-success">{message}</p>}

                    <button className="auth-button" disabled={loading}>
                        {loading ? "Updating..." : "Reset password"}
                    </button>
                </form>

                <p className="auth-footer"><Link to="/login">Back to login</Link></p>
            </div>
        </div>
    );
}

export default ResetPassword;
