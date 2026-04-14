import { TerminalTab } from "./components/TerminalTab";
import "./styles/globals.css";

function App() {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <TerminalTab isActive={true} />
    </div>
  );
}

export default App;
