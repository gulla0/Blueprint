import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

const glossyButtonStyle: React.CSSProperties = {
  background: "linear-gradient(to bottom, #1f2937, #111827, #000000)",
  color: "white",
  border: "1px solid #374151",
  borderRadius: "50px",
  padding: "12px 24px",
  fontWeight: "600",
  fontSize: "14px",
  boxShadow:
    "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  transition: "all 0.2s ease-in-out",
  cursor: "pointer",
  transform: "scale(1)",
};

export function Button({
  children,
  className = "",
  style,
  ...props
}: ButtonProps) {
  const combinedStyle = {
    ...glossyButtonStyle,
    ...style,
  };

  return (
    <button
      className={`inline-block ${className}`}
      style={combinedStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.boxShadow =
          "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow =
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
      }}
      {...props}
    >
      {children}
    </button>
  );
}
