import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api";

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            const data = await login({ email: email.trim(), password });
            localStorage.setItem("access_token", data.access_token);
            navigate("/dashboard");
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="brand-mark">V</div>
                <h1>Welcome back</h1>
                <p className="auth-subtitle">Manage your queues from one place.</p>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@restaurant.com" required />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required />
                    </div>

                    {error && <p className="form-error">{error}</p>}

                    <button className="auth-button" type="submit" disabled={loading}>
                        {loading ? "Signing in..." : "Sign in"}
                    </button>
                </form>

                <Link to="/demo" className="demo-button">Try the live demo — no login required</Link>

                <p className="auth-footer"><Link to="/forgot-password">Forgot password?</Link></p><p className="auth-footer">New to Vque? <Link to="/signup">Create an account</Link></p>
            </div>
        </div>
    );
}

export default Login;
