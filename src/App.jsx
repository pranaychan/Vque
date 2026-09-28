import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import "./App.css";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import JoinQueue from "./pages/JoinQueue";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DemoLogin from "./pages/DemoLogin";

function Home() {
    return (
        <>
            <Navbar />
            <main className="home-page">
                <section className="hero-copy">
                    <div className="hero-badge"><span /> Smart virtual queues for restaurants</div>
                    <h1>Turn waiting time into <span>better experiences.</span></h1>
                    <p>
                        Vque helps restaurants manage queues across locations while customers can join
                        and track their place without creating an account.
                    </p>
                    <div className="hero-actions">
                        <Link to="/signup" className="hero-primary">Create restaurant account</Link>
                        <Link to="/demo" className="hero-secondary">Try live demo</Link>
                        <Link to="/login" className="hero-secondary">Sign in</Link>
                    </div>
                </section>

                <section className="hero-visual">
                    <div className="mock-window">
                        <div className="mock-top"><span /><span /><span /></div>
                        <div className="mock-body">
                            <div className="mock-line wide" />
                            <div className="mock-line" />
                            <div className="mock-stats"><div /><div /><div /></div>
                            <div className="mock-queue">
                                <div className="mock-avatar">A</div>
                                <div><b>Alex</b><small>Party of 2</small></div>
                                <strong>#3</strong>
                            </div>
                            <div className="mock-queue">
                                <div className="mock-avatar">M</div>
                                <div><b>Maya</b><small>Party of 4</small></div>
                                <strong>#4</strong>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}

// Redirects to /login when there is no access token, remembering where the
// user was headed so we could send them back after they sign in.
function ProtectedRoute({ children }) {
    const location = useLocation();
    const token = localStorage.getItem("access_token");
    if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return children;
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/demo" element={<DemoLogin />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/join/:queueId" element={<JoinQueue />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
