import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/jetbrains-mono";
import { ThemeProvider } from "next-themes";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { Toaster } from "./components/ui/sonner";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
      <Toaster position="bottom-right" />
    </ThemeProvider>,
  );
