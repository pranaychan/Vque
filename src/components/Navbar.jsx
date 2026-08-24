import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="navbar">
      <Link to="/" className="nav-logo">
        Vque
      </Link>

      <div className="nav-buttons">
        <Link to="/login" className="login-button">
          Login
        </Link>

        <Link to="/signup" className="signup-button">
          Signup
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;