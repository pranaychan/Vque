import './App.css';
import Navbar from "./components/Navbar";

function App() {
  return (
    <div className="app">
      <Navbar />

      <main className="hero">
        <h1>Vque</h1>

        <h2>Your place in line,</h2>
        <h2>without the waiting.</h2>

        <p>
          Join virtual queues from anywhere, track your position,
          and get notified when it is your turn.
        </p>

        <button className="get-started">Get Started</button>
      </main>
    </div>
  );
}

export default App;