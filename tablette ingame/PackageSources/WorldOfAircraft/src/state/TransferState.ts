/**
 * TransferState - State management for pilot & aircraft transfers (Phase 7)
 * Pilot transfer (Map) + Aircraft transfer (Hangar)
 */
import { Subject } from "@microsoft/msfs-sdk";

export const transferState = {
  // ═══ Pilot transfer (Map) ═══
  showPilotTransferPopup: Subject.create<boolean>(false),
  transferDestIcao: Subject.create<string>(""),
  transferDestName: Subject.create<string>(""),
  transferEstimate: Subject.create<{ distance_nm: number; cost_cr: number } | null>(null),

  // ═══ Aircraft transfer (Hangar) ═══
  showAircraftTransferPopup: Subject.create<boolean>(false),
  acTransferAircraftId: Subject.create<string>(""),
  acTransferAircraftReg: Subject.create<string>(""),
  acTransferOriginIcao: Subject.create<string>(""),
  acTransferOwnerType: Subject.create<"player" | "company">("player"),
  acTransferDestIcao: Subject.create<string>(""),
  acTransferEstimate: Subject.create<{ distance_nm: number; cost_cr: number } | null>(null),
};
