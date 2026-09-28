import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { demoLogin } from "../api";

function DemoLogin() {
    const [error, setError] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        let active = true;
        async function startDemo() {
            try {
                const data = await demoLogin();
                if (!active) return;
                localStorage.setItem("access_token", data.access_token);
                localStorage.setItem("demo_mode", "true");
                navigate("/dashboard", { replace: true });
            } catch (err) {
                if (active) setError(err.message);
            }
        }
        startDemo();
        return () => { active = false; };
    }, [navigate]);

    return (
        <div className="auth-page">
            <div className="auth-card demo-card">
                <div className="brand-mark">V</div>
                <h1>Starting your demo</h1>
                <p className="auth-subtitle">We're preparing a sample restaurant dashboard. No account or email required.</p>
                {error ? <><p className="form-error">{error}</p><button className="auth-button" onClick={() => window.location.reload()}>Try again</button></> : <div className="demo-loading">Loading demo workspace…</div>}
            </div>
        </div>
    );
}

export default DemoLogin;
