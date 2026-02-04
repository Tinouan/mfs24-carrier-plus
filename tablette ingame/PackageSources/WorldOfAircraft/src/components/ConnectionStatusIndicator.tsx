/**
 * ConnectionStatusIndicator - Network status indicator
 * Shows connection status in the header/footer of the EFB
 *
 * States:
 * - Online (green): Connected to SEED (Online mode)
 * - Offline (blue): Solo mode - local career
 * - Syncing (yellow): Synchronizing pending actions
 * - Connecting (gray): Attempting connection
 */
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";
import { NetworkState, type ConnectionStatus } from "../state/NetworkState";

// ═══════════════════════════════════════════════════════════
// CONNECTION STATUS INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════

export interface ConnectionStatusIndicatorProps {
  // Optional - uses NetworkState singleton if not provided
  status?: Subject<ConnectionStatus>;
  pendingCount?: Subject<number>;
  compact?: boolean; // Show only icon without text
}

export function renderConnectionStatusIndicator(props: ConnectionStatusIndicatorProps = {}): VNode {
  // Use props or NetworkState singleton
  const status = props.status || NetworkState.status;
  const pendingCount = props.pendingCount || Subject.create(0);

  // Subscribe to NetworkState pending actions
  if (!props.pendingCount) {
    // Update pending count when actions change
    NetworkState.pendingActions.sub((actions) => {
      pendingCount.set(actions.length);
    });
  }

  const compact = props.compact ?? false;

  // Computed display properties
  const displayData = MappedSubject.create(
    ([s, pending]) => {
      switch (s) {
        case "online":
          return {
            color: "#22c55e",
            bgColor: "rgba(34, 197, 94, 0.15)",
            borderColor: "rgba(34, 197, 94, 0.3)",
            icon: "check-circle",
            text: "ONLINE",
            showPending: false,
          };
        case "syncing":
          return {
            color: "#f59e0b",
            bgColor: "rgba(245, 158, 11, 0.15)",
            borderColor: "rgba(245, 158, 11, 0.3)",
            icon: "refresh",
            text: "SYNC...",
            showPending: true,
          };
        case "offline":
          return {
            color: "#60a5fa",
            bgColor: "rgba(96, 165, 250, 0.15)",
            borderColor: "rgba(96, 165, 250, 0.3)",
            icon: "user",
            text: "SOLO",
            showPending: pending > 0,
          };
        case "connecting":
        default:
          return {
            color: "#6b7280",
            bgColor: "rgba(107, 114, 128, 0.15)",
            borderColor: "rgba(107, 114, 128, 0.3)",
            icon: "loader",
            text: "...",
            showPending: false,
          };
      }
    },
    status,
    pendingCount
  );

  // Container style
  const containerStyle = displayData.map((d) =>
    compact
      ? `display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: ${d.bgColor}; border: 1px solid ${d.borderColor}; border-radius: 50%;`
      : `display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: ${d.bgColor}; border: 1px solid ${d.borderColor}; border-radius: 12px; font-size: 11px; color: ${d.color};`
  );

  return (
    <div style={containerStyle}>
      {/* Status Icon */}
      <div style={displayData.map((d) => `color: ${d.color}; display: flex; align-items: center;`)}>
        {/* Check Circle (Online) */}
        <svg
          style={displayData.map((d) =>
            d.icon === "check-circle" ? "width: 14px; height: 14px;" : "display: none;"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9 12l2 2 4-4" />
        </svg>

        {/* Refresh (Syncing) */}
        <svg
          style={displayData.map((d) =>
            d.icon === "refresh" ? "width: 14px; height: 14px; animation: spin 1s linear infinite;" : "display: none;"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M1 4v6h6" />
          <path d="M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>

        {/* User (Solo/Offline) */}
        <svg
          style={displayData.map((d) =>
            d.icon === "user" ? "width: 14px; height: 14px;" : "display: none;"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>

        {/* Loader (Connecting) */}
        <svg
          style={displayData.map((d) =>
            d.icon === "loader" ? "width: 14px; height: 14px; animation: spin 1s linear infinite;" : "display: none;"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
        </svg>
      </div>

      {/* Status Text (only in non-compact mode) */}
      {!compact && (
        <span style={displayData.map((d) => `color: ${d.color}; font-weight: 600;`)}>
          {displayData.map((d) => d.text)}
        </span>
      )}

      {/* Pending Count (only when offline with pending actions) */}
      {!compact && (
        <span
          style={MappedSubject.create(
            ([d, pending]) =>
              d.showPending && pending > 0
                ? `color: ${d.color}; font-size: 10px; opacity: 0.8;`
                : "display: none;",
            displayData,
            pendingCount
          )}
        >
          {pendingCount.map((c) => `(${c})`)}
        </span>
      )}

      {/* CSS for spinner animation */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CONVENIENCE EXPORT
// ═══════════════════════════════════════════════════════════

export const ConnectionStatusIndicator = {
  render: renderConnectionStatusIndicator,
};
