import { readLaunch } from "./launch";
import { SessionProvider } from "./state/session";
import { MainWindow } from "./views/MainWindow";
import { Overlay } from "./views/Overlay";
import { Popout } from "./views/Popout";

export function App() {
  const launch = readLaunch();
  if (launch.mode === "overlay") return <Overlay launch={launch} />;
  if (launch.mode === "popout") return <Popout launch={launch} />;
  return (
    <SessionProvider>
      <MainWindow />
    </SessionProvider>
  );
}
