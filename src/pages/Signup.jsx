import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup } from "../api";
import { getPasswordChecks } from "../passwordChecks";

function Signup() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const checks = useMemo(() => getPasswordChecks(password), [password]);
    const passwordStrong = Object.values(checks).every(Boolean);

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (name.trim().length < 2) {
            setError("Enter a valid restaurant name.");
            return;
        }

        if (!passwordStrong) {
            setError("Please meet all password security requirements.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);

        try {
            await signup({ name: name.trim(), email: email.trim(), password });
            navigate(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card auth-card-wide">
                <div className="brand-mark">V</div>
                <h1>Create your restaurant account</h1>
                <p className="auth-subtitle">Set up your Vque workspace in minutes.</p>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Restaurant name</label>
                        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. The Garden Table" maxLength="100" required />
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@restaurant.com" required />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a strong password" maxLength="64" required />
                    </div>

                    {password.length > 0 && (
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
                        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" maxLength="64" required />
                    </div>

                    {error && <p className="form-error">{error}</p>}

                    <button className="auth-button" type="submit" disabled={loading}>
                        {loading ? "Creating account..." : "Create account"}
                    </button>
                </form>

                <p className="auth-footer">Already have an account? <Link to="/login">Log in</Link></p>
            </div>
        </div>
    );
}

export default Signup;
