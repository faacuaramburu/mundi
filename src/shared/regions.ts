import { normalizeName } from './countries.js';
import type { Country } from './countries.js';

// UN M49 geographic groups: https://unstats.un.org/unsd/methodology/m49/
// North America combines Northern America, Central America and the Caribbean.
// Each catalog country has one region; e.g. Russia is Europe, Cyprus is Asia.
export const regionCountries = {
  africa: 'DZA AGO BEN BWA BFA BDI CPV CMR CAF TCD COM COG COD CIV DJI EGY GNQ ERI SWZ ETH GAB GMB GHA GIN GNB KEN LSO LBR LBY MDG MWI MLI MRT MUS MAR MOZ NAM NER NGA RWA STP SEN SYC SLE SOM ZAF SSD SDN TZA TGO TUN UGA ZMB ZWE'.split(' '),
  asia: 'AFG ARM AZE BHR BGD BTN BRN KHM CHN CYP GEO IND IDN IRN IRQ ISR JPN JOR KAZ KWT KGZ LAO LBN MYS MDV MNG MMR NPL PRK OMN PAK PSE PHL QAT SAU SGP KOR LKA SYR TJK THA TLS TUR TKM ARE UZB VNM YEM'.split(' '),
  europe: 'ALB AND AUT BLR BEL BIH BGR HRV CZE DNK EST FIN FRA DEU GRC VAT HUN ISL IRL ITA LVA LIE LTU LUX MLT MDA MCO MNE NLD MKD NOR POL PRT ROU RUS SMR SRB SVK SVN ESP SWE CHE UKR GBR'.split(' '),
  northAmerica: 'ATG BHS BRB BLZ CAN CRI CUB DMA DOM SLV GRD GTM HTI HND JAM MEX NIC PAN KNA LCA VCT TTO USA'.split(' '),
  southAmerica: 'ARG BOL BRA CHL COL ECU GUY PRY PER SUR URY VEN'.split(' '),
  oceania: 'AUS FJI KIR MHL FSM NRU NZL PLW PNG WSM SLB TON TUV VUT'.split(' '),
} as const;
export type Region = keyof typeof regionCountries;
const regions = new Map<string, Region>(Object.entries(regionCountries)
  .flatMap(([region, ids]) => ids.map(id => [id, region as Region] as const)));

export function countryRegion(id: string): Region | undefined { return regions.get(id); }

export function filterIndexCountries(countries: readonly Country[], discoveries: ReadonlySet<string>,
  { query = '', status = 'all', region = 'all' }: { query?: string; status?: string; region?: string }): Country[] {
  const normalized = normalizeName(query);
  return countries.filter(country => (region === 'all' || countryRegion(country.id) === region)
    && (!normalized || [country.name, country.nameEs, country.id].some(name => normalizeName(name).includes(normalized)))
    && (status === 'all' || discoveries.has(country.id) === (status === 'found')));
}
