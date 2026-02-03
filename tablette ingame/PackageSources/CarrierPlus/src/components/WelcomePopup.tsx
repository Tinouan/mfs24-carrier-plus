/**
 * WelcomePopup - First launch setup dialog
 * Allows user to set pilot name, nationality, and starting airport
 * Uses Button components for Coherent GT compatibility (no native select)
 */
import { FSComponent, VNode, Subject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language } from "../types";

// All countries (ISO 3166-1 alpha-2) sorted by name
const NATIONALITIES = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "CV", name: "Cape Verde" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CR", name: "Costa Rica" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" },
  { code: "GD", name: "Grenada" },
  { code: "GT", name: "Guatemala" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "CI", name: "Ivory Coast" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KP", name: "North Korea" },
  { code: "KR", name: "South Korea" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Palestine" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "VC", name: "Saint Vincent" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "Sao Tome and Principe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatican City" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];


// ===================================================================
// WELCOME POPUP PROPS
// ===================================================================

export interface WelcomePopupProps {
  showPopup: Subject<boolean>;
  pilotName: Subject<string>;
  nationality: Subject<string>;
  startingAirport: Subject<string>;
  airportValid: Subject<boolean>;
  currentLanguage: Subject<Language>;
  pilotNameInputRef: NodeReference<HTMLInputElement>;
  airportInputRef: NodeReference<HTMLInputElement>;
  onValidate: () => void;
}

// ===================================================================
// WELCOME POPUP COMPONENT
// ===================================================================

export function renderWelcomePopup(props: WelcomePopupProps): VNode {
  const {
    showPopup,
    nationality,
    airportValid,
    currentLanguage,
    pilotNameInputRef,
    airportInputRef,
    onValidate,
  } = props;

  // Handler for validate button - only fires if airport is valid
  const handleValidate = (): void => {
    if (airportValid.get()) {
      onValidate();
    }
  };

  return (
    <div style={showPopup.map(show => show
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 300; display: flex; align-items: center; justify-content: center;"
      : "display: none;")}>
      <div style="background: linear-gradient(135deg, #1a1a24 0%, #252532 100%); border: 2px solid #3b82f6; border-radius: 16px; padding: 20px; width: 380px; max-height: 85%; overflow-y: auto; box-shadow: 0 12px 40px rgba(59, 130, 246, 0.3);">

        {/* Header with airplane icon */}
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="width: 56px; height: 56px; margin: 0 auto 10px; background: rgba(59, 130, 246, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <svg style="width: 32px; height: 32px;" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
          </div>
          <div style="font-size: 18px; font-weight: 700; color: white; margin-bottom: 2px;">
            {currentLanguage.map(l => l === "fr" ? "Bienvenue dans Carrier+" : "Welcome to Carrier+")}
          </div>
          <div style="font-size: 11px; color: #9ca3af;">
            {currentLanguage.map(l => l === "fr" ? "Configurez votre profil pilote" : "Set up your pilot profile")}
          </div>
        </div>

        {/* Pilot Name Input */}
        <div style="margin-bottom: 14px;">
          <div style="font-size: 10px; font-weight: 600; color: #60a5fa; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
            {currentLanguage.map(l => l === "fr" ? "Nom du pilote" : "Pilot Name")}
          </div>
          <input
            ref={pilotNameInputRef}
            type="text"
            placeholder="Pilote"
            style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 10px; color: white; font-size: 13px; outline: none; box-sizing: border-box;"
            onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
          />
        </div>

        {/* Nationality List */}
        <div style="margin-bottom: 14px;">
          <div style="font-size: 10px; font-weight: 600; color: #60a5fa; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
            {currentLanguage.map(l => l === "fr" ? "Nationalite" : "Nationality")}
          </div>
          <div class="nationality-list" style="background: #1a1a24; border: 1px solid #374151; border-radius: 6px; max-height: 150px; overflow-y: auto;">
            {NATIONALITIES.map(nat => (
              <div
                class="nationality-item"
                data-code={nat.code}
                style={nationality.map(n => n === nat.code
                  ? "padding: 8px 12px; font-size: 12px; color: white; background: #3b82f6; cursor: pointer; border-bottom: 1px solid #374151;"
                  : "padding: 8px 12px; font-size: 12px; color: #d1d5db; cursor: pointer; border-bottom: 1px solid #2a2a3a;")}
              >
                <span style="font-weight: 500; margin-right: 8px; opacity: 0.6;">{nat.code}</span>
                {nat.name}
              </div>
            ))}
          </div>
        </div>

        {/* Starting Airport ICAO Input */}
        <div style="margin-bottom: 14px;">
          <div style="font-size: 10px; font-weight: 600; color: #60a5fa; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
            {currentLanguage.map(l => l === "fr" ? "Aeroport de depart (ICAO)" : "Starting Airport (ICAO)")}
          </div>
          <input
            ref={airportInputRef}
            type="text"
            placeholder="LFPG"
            maxLength={4}
            style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 10px; color: white; font-size: 13px; font-family: monospace; text-transform: uppercase; outline: none; box-sizing: border-box; letter-spacing: 2px;"
            onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
          />
          <div style="font-size: 9px; color: #6b7280; margin-top: 4px;">
            {currentLanguage.map(l => l === "fr"
              ? "Code ICAO 4 lettres (ex: LFPG, EGLL, KJFK)"
              : "4-letter ICAO code (e.g., LFPG, EGLL, KJFK)")}
          </div>
        </div>

        {/* Info box */}
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 10px; margin-bottom: 14px;">
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <svg style="width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            <div style="font-size: 10px; color: #9ca3af; line-height: 1.4;">
              {currentLanguage.map(l => l === "fr"
                ? "Vous recevrez un Cessna 172 et 100 000 credits pour demarrer."
                : "You'll receive a Cessna 172 and 100,000 credits to start.")}
            </div>
          </div>
        </div>

        {/* Validate Button - disabled if ICAO invalid */}
        <Button callback={handleValidate}>
          <div style={airportValid.map(valid => valid
            ? "background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border: none; border-radius: 8px; padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: white; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);"
            : "background: #374151; border: none; border-radius: 8px; padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: #6b7280; cursor: not-allowed; opacity: 0.6;")}>
            {currentLanguage.map(l => l === "fr" ? "Commencer l'aventure" : "Start the adventure")}
          </div>
        </Button>

      </div>
    </div>
  );
}
