import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

function Home() {
  return (
    <>
      <Navbar />

      <main className="hero">
        <h1>Vque</h1>

        <h2>Your place in line,</h2>
        <h2>without the waiting.</h2>

        <p>
          Join virtual queues from anywhere, track your position,
          and get notified when it is your turn.
        </p>

        <button className="get-started">
          Get Started
        </button>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;