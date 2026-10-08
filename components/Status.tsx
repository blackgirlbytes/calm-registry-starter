/** A full-height message for loading and error states. */
export function Status({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`grid min-h-[70dvh] place-items-center text-center lg:text-[17px] ${tone === "error" ? "text-danger" : "text-muted"}`}>
      {children}
    </p>
  );
}
