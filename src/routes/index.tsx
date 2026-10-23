import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <iframe
      title="Chip Royale"
      src="/royale/index.html?v=25"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        background: "#061018",
      }}
    />
  );
}