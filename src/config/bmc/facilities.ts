/**
 * src/config/bmc/facilities.ts
 *
 * Brihanmumbai's named public facilities, read from public sources and logged
 * in the evidence registry (`./evidence.ts`). A figure with an `evidenceId`
 * was read in that source; a facility without one keeps a modelled figure on
 * the platform. Positions are approximate site locations and were checked to
 * fall inside the ward that serves them; the ward itself is resolved from the
 * surveyed ward boundaries at runtime, never typed here.
 *
 * BMC configuration, not core: another corporation supplies its own.
 */

export interface BmcHospitalSpec {
  name: string
  type: 'major' | 'peripheral' | 'speciality'
  lat: number
  lng: number
  beds?: number
  evidenceId?: string
}

export function bmcHospitals(): BmcHospitalSpec[] {
  return [
    { name: 'KEM Hospital, Parel', type: 'major', lat: 19.0025, lng: 72.8417, beds: 2250, evidenceId: 'ev-beds-kem' },
    { name: 'LTMG Hospital, Sion', type: 'major', lat: 19.0368, lng: 72.8597, beds: 1462, evidenceId: 'ev-beds-ltmg' },
    { name: 'BYL Nair Hospital, Mumbai Central', type: 'major', lat: 18.9726, lng: 72.8216 },
    { name: 'Dr R N Cooper Hospital, Vile Parle', type: 'major', lat: 19.1067, lng: 72.837, beds: 715, evidenceId: 'ev-beds-cooper' },
    { name: 'Kasturba Hospital for Infectious Diseases, Chinchpokli', type: 'speciality', lat: 18.983, lng: 72.829 },
    { name: 'HBT Trauma Care Hospital, Jogeshwari', type: 'speciality', lat: 19.138, lng: 72.857, beds: 266, evidenceId: 'ev-beds-trauma-jogeshwari' },
    { name: 'K B Bhabha Hospital, Bandra', type: 'peripheral', lat: 19.0583, lng: 72.8335, beds: 436, evidenceId: 'ev-beds-kbbhabha' },
    { name: 'Bhabha Hospital, Kurla', type: 'peripheral', lat: 19.07, lng: 72.88 },
    { name: 'Rajawadi Hospital, Ghatkopar', type: 'peripheral', lat: 19.0796, lng: 72.9036, beds: 596, evidenceId: 'ev-beds-rajawadi' },
    { name: 'Bhagwati Hospital, Borivali', type: 'peripheral', lat: 19.234, lng: 72.85, beds: 110, evidenceId: 'ev-beds-bhagwati' },
    { name: 'Shatabdi Hospital, Kandivali', type: 'peripheral', lat: 19.2045, lng: 72.842, beds: 444, evidenceId: 'ev-beds-shatabdi-kandivali' },
    { name: 'Shatabdi Hospital, Govandi', type: 'peripheral', lat: 19.056, lng: 72.915, beds: 210, evidenceId: 'ev-beds-shatabdi-govandi' },
    { name: 'M T Agarwal Hospital, Mulund', type: 'peripheral', lat: 19.172, lng: 72.952 },
    { name: 'Siddharth Hospital, Goregaon', type: 'peripheral', lat: 19.164, lng: 72.846 },
    { name: 'V N Desai Hospital, Santacruz', type: 'peripheral', lat: 19.081, lng: 72.847 },
  ]
}

export interface BmcTreatmentPlantSpec {
  name: string
  lat: number
  lng: number
  capacityMld: number
  /** Commissioned, or the year the upgrade is due. */
  status: string
  evidenceId: string
}

/** The Mumbai Sewage Disposal Project's wastewater treatment facilities. */
export function bmcTreatmentPlants(): BmcTreatmentPlantSpec[] {
  return [
    { name: 'Colaba WwTF', lat: 18.906, lng: 72.814, capacityMld: 37, status: 'commissioned 2020', evidenceId: 'ev-stp-colaba' },
    { name: 'Worli WwTF', lat: 19.006, lng: 72.817, capacityMld: 500, status: 'due Jul 2027', evidenceId: 'ev-stp-capacities-2026' },
    { name: 'Bandra WwTF', lat: 19.046, lng: 72.821, capacityMld: 360, status: 'due Jul 2027', evidenceId: 'ev-stp-capacities-2026' },
    { name: 'Dharavi WwTF', lat: 19.05, lng: 72.86, capacityMld: 418, status: 'due Jul 2027', evidenceId: 'ev-stp-capacities-2026' },
    { name: 'Versova WwTF', lat: 19.135, lng: 72.816, capacityMld: 180, status: 'due Jul 2026', evidenceId: 'ev-stp-capacities-2026' },
    { name: 'Ghatkopar WwTF', lat: 19.075, lng: 72.915, capacityMld: 337, status: 'due Jul 2026', evidenceId: 'ev-stp-capacities-2026' },
    { name: 'Bhandup WwTF', lat: 19.15, lng: 72.945, capacityMld: 215, status: 'due Aug 2026', evidenceId: 'ev-stp-capacities-2026' },
    { name: 'Malad WwTF', lat: 19.18, lng: 72.82, capacityMld: 454, status: 'due Jul 2028', evidenceId: 'ev-stp-capacities-2026' },
  ]
}

export interface BmcPumpingStationSpec {
  name: string
  lat: number
  lng: number
  pumps: number
  evidenceId: string
}

/**
 * The six BRIMSTOWAD storm-water pumping stations in service. Every pump lifts
 * 6,000 litres a second (`ev-pump-britannia`), so capacity is pumps x 6 m3/s.
 * Mogra and Mahul are not built yet and are not listed.
 */
export function bmcPumpingStations(): BmcPumpingStationSpec[] {
  return [
    { name: 'Irla Pumping Station', lat: 19.103, lng: 72.826, pumps: 7, evidenceId: 'ev-pump-britannia' },
    { name: 'Haji Ali Pumping Station', lat: 18.982, lng: 72.812, pumps: 8, evidenceId: 'ev-pump-britannia' },
    { name: 'Love Grove Pumping Station', lat: 19.005, lng: 72.815, pumps: 10, evidenceId: 'ev-pump-britannia' },
    { name: 'Cleveland Bunder Pumping Station', lat: 19.02, lng: 72.816, pumps: 6, evidenceId: 'ev-pump-britannia' },
    { name: 'Britannia Pumping Station', lat: 18.975, lng: 72.849, pumps: 6, evidenceId: 'ev-pump-britannia' },
    { name: 'Gazdarbandh Pumping Station', lat: 19.075, lng: 72.828, pumps: 6, evidenceId: 'ev-pump-britannia' },
  ]
}

export interface BmcWasteFacilitySpec {
  name: string
  type: 'transfer-station' | 'processing-plant' | 'landfill'
  lat: number
  lng: number
  capacityTpd: number
  /** Published daily intake where one is reported. */
  loadTpd?: number
  evidenceId?: string
}

export function bmcWasteFacilities(): BmcWasteFacilitySpec[] {
  return [
    { name: 'Kanjurmarg Processing Facility', type: 'processing-plant', lat: 19.13, lng: 72.94, capacityTpd: 6500, loadTpd: 5900, evidenceId: 'ev-kanjurmarg-tpd' },
    { name: 'Deonar Dumping Ground', type: 'landfill', lat: 19.064, lng: 72.92, capacityTpd: 700, loadTpd: 600, evidenceId: 'ev-deonar-tpd-fpj' },
    { name: 'Mulund Dumping Ground (closed - biomining)', type: 'landfill', lat: 19.164, lng: 72.962, capacityTpd: 0, evidenceId: 'ev-mulund-legacy-2026' },
    { name: 'Mahalaxmi Refuse Transfer Station', type: 'transfer-station', lat: 18.988, lng: 72.825, capacityTpd: 750, evidenceId: 'ev-rts-list' },
    { name: 'Kurla Refuse Transfer Station', type: 'transfer-station', lat: 19.075, lng: 72.885, capacityTpd: 700, evidenceId: 'ev-rts-list' },
    { name: 'Versova Lagoon Transfer Station', type: 'transfer-station', lat: 19.135, lng: 72.815, capacityTpd: 400, evidenceId: 'ev-rts-list' },
    { name: 'Gorai Refuse Transfer Station', type: 'transfer-station', lat: 19.242, lng: 72.818, capacityTpd: 500, evidenceId: 'ev-rts-list' },
  ]
}

export interface BmcAirStationSpec {
  name: string
  operator: 'MPCB' | 'IITM-SAFAR' | 'BMC'
  lat: number
  lng: number
}

/**
 * Continuous ambient air quality stations inside BMC limits, from the CPCB
 * station list (`src-cpcb-station-list`). Vasai West is outside BMC and is left
 * out, as is a second "Bandra" row at Kherwadi's address.
 */
export function bmcAirStations(): BmcAirStationSpec[] {
  return [
    { name: 'Colaba', operator: 'MPCB', lat: 18.91, lng: 72.82 },
    { name: 'Navy Nagar-Colaba', operator: 'IITM-SAFAR', lat: 18.8978, lng: 72.8133 },
    { name: 'Mazgaon', operator: 'IITM-SAFAR', lat: 18.967, lng: 72.8421 },
    { name: 'Byculla', operator: 'BMC', lat: 18.9767, lng: 72.838 },
    { name: 'Sewri', operator: 'BMC', lat: 19.0001, lng: 72.8567 },
    { name: 'Sion', operator: 'MPCB', lat: 19.047, lng: 72.8746 },
    { name: 'Worli', operator: 'MPCB', lat: 18.9936, lng: 72.8128 },
    { name: 'Siddharth Nagar-Worli', operator: 'IITM-SAFAR', lat: 19.0001, lng: 72.814 },
    { name: 'Bandra Kurla Complex', operator: 'IITM-SAFAR', lat: 19.0535, lng: 72.8464 },
    { name: 'Bandra Kurla Complex', operator: 'MPCB', lat: 19.0659, lng: 72.8621 },
    { name: 'Kherwadi-Bandra East', operator: 'MPCB', lat: 19.0632, lng: 72.8456 },
    { name: 'Vile Parle West', operator: 'MPCB', lat: 19.1086, lng: 72.8362 },
    { name: 'Chakala-Andheri East', operator: 'IITM-SAFAR', lat: 19.1107, lng: 72.8608 },
    { name: 'CSIA Airport T2', operator: 'MPCB', lat: 19.1008, lng: 72.8746 },
    { name: 'Kurla', operator: 'MPCB', lat: 19.0863, lng: 72.8888 },
    { name: 'Chembur', operator: 'MPCB', lat: 19.0365, lng: 72.8954 },
    { name: 'Deonar', operator: 'IITM-SAFAR', lat: 19.0495, lng: 72.923 },
    { name: 'Shivaji Nagar', operator: 'BMC', lat: 19.0605, lng: 72.9234 },
    { name: 'Ghatkopar', operator: 'BMC', lat: 19.0837, lng: 72.921 },
    { name: 'Powai', operator: 'MPCB', lat: 19.1375, lng: 72.9151 },
    { name: 'Khindipada-Bhandup West', operator: 'IITM-SAFAR', lat: 19.1653, lng: 72.9221 },
    { name: 'Mulund West', operator: 'MPCB', lat: 19.175, lng: 72.9419 },
    { name: 'Malad West', operator: 'IITM-SAFAR', lat: 19.1971, lng: 72.822 },
    { name: 'Mindspace-Malad West', operator: 'MPCB', lat: 19.1879, lng: 72.8304 },
    { name: 'Kandivali East', operator: 'MPCB', lat: 19.2058, lng: 72.8682 },
    { name: 'Kandivali West', operator: 'BMC', lat: 19.2159, lng: 72.8317 },
    { name: 'Borivali East', operator: 'MPCB', lat: 19.2243, lng: 72.8658 },
    { name: 'Borivali East', operator: 'IITM-SAFAR', lat: 19.2324, lng: 72.869 },
  ]
}
