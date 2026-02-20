/**
 * positionState - Reactive state for pilot position
 * BDD = single source of truth. SimVar = confirmation only.
 */
import { Subject } from "@microsoft/msfs-sdk";

export const positionState = {
  dbAirport: Subject.create<string>(""),
  simVarAirport: Subject.create<string>("----"),
  isAtCorrectAirport: Subject.create<boolean>(true),
};
