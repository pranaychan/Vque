import { Link, useNavigate } from "react-router-dom";

function Navbar() {
    const navigate = useNavigate();
    const token = localStorage.getItem("access_token");
    const demo = localStorage.getItem("demo_mode") === "true";

    function logout() {
        localStorage.removeItem("access_token");
        localStorage.removeItem("demo_mode");
        navigate("/");
    }

    return (
        <nav className="navbar">
            <Link to="/" className="nav-logo"><span>V</span> Vque</Link>
            <div className="nav-buttons">
                {token ? (
                    <>
                        <Link to="/dashboard" className="nav-link">Dashboard</Link>
                        {demo && <span className="demo-nav-badge">Demo</span>}
                        <button onClick={logout} className="nav-outline">
                            {demo ? "Exit demo" : "Sign out"}
                        </button>
                    </>
                ) : (
                    <>
                        <Link to="/login" className="nav-link">Login</Link>
                        <Link to="/signup" className="nav-cta">Get started</Link>
                    </>
                )}
            </div>
        </nav>
    );
}

export default Navbar;
