export interface Country {
  id: string;
  name: string;
  nameEs: string;
  focus: [number, number];
  path: string;
  neighbors: string[];
}

export interface Atlas {
  version: number;
  width: number;
  height: number;
  countries: Country[];
  context: { name: string; path: string }[];
}

export interface Hint {
  label: string;
  color: string;
  correct: boolean;
  border: boolean;
}

export function formatDistance(distance: number, language: 'en' | 'es' = 'en'): string {
  if (!Number.isFinite(distance) || distance < 0) throw new Error('Invalid distance');
  return `${distance === 0 ? '' : '≈ '}${new Intl.NumberFormat(language).format(Math.round(distance))} km`;
}

export function getHint(distance: number, correct: boolean, border: boolean): Hint {
  if (!Number.isFinite(distance) || distance < 0) throw new Error('Invalid distance');
  if (correct) return { label: 'Correct country', color: '#419b72', correct: true, border: false };
  if (border) return { label: 'Shares a border', color: '#a47be5', correct: false, border: true };
  const bands = [
    { limit: 500, label: 'Very hot', color: '#9d2537' },
    { limit: 1500, label: 'Hot', color: '#d54e44' },
    { limit: 3000, label: 'Warm', color: '#eb8c45' },
    { limit: 6000, label: 'Cool', color: '#e8c66c' },
    { limit: Infinity, label: 'Cold', color: '#f1e5c8' },
  ];
  const band = bands.find((item) => distance < item.limit)!;
  return { label: band.label, color: band.color, correct: false, border: false };
}

export function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const aliases = new Map<string, string[]>([
  ['USA', ['United States', 'USA', 'US', 'Estados Unidos', 'EEUU', 'EE.UU.']],
  ['GBR', ['United Kingdom', 'UK', 'Reino Unido', 'Gran Bretana', 'Britain']],
  ['CIV', ['Ivory Coast', 'Costa de Marfil', "Cote d'Ivoire"]],
  ['CZE', ['Czech Republic', 'Czechia', 'Republica Checa', 'Chequia']],
  ['VAT', ['Vatican', 'Vatican City', 'Holy See', 'Vaticano', 'Santa Sede']],
  ['COD', ['Democratic Republic of the Congo', 'DR Congo', 'Congo Kinshasa', 'Republica Democratica del Congo']],
  ['COG', ['Republic of the Congo', 'Congo Brazzaville', 'Republica del Congo']],
  ['KOR', ['South Korea', 'Corea del Sur']], ['PRK', ['North Korea', 'Corea del Norte']],
  ['SWZ', ['Eswatini', 'Swaziland', 'Suazilandia']], ['CPV', ['Cape Verde', 'Cabo Verde']],
  ['TLS', ['East Timor', 'Timor Oriental', 'Timor Leste']],
  ['TUR', ['Turkey', 'Turkiye', 'Turquia']], ['PSE', ['Palestine', 'Palestina']],
]);

export function countryNames(country: Country): string[] {
  return [country.name, country.nameEs, country.id, ...(aliases.get(country.id) ?? [])].map(normalizeName);
}

export function findCountries(countries: Country[], query: string): Country[] {
  const normalized = normalizeName(query);
  if (!normalized || normalized.length > 80) return [];
  let matching = countries.filter((country) => countryNames(country).some((name) => name.includes(normalized)));
  if (matching.length === 0 && normalized.length >= 4) {
    matching = countries.filter((country) => countryNames(country).some((name) => {
      if (Math.abs(name.length - normalized.length) > 2) return false;
      let previous = Array.from({ length: name.length + 1 }, (_, index) => index);
      for (let i = 1; i <= normalized.length; i++) {
        const current = [i];
        for (let j = 1; j <= name.length; j++) {
          current.push(Math.min(
            current.at(j - 1)! + 1,
            previous.at(j)! + 1,
            previous.at(j - 1)! + Number(normalized.at(i - 1) !== name.at(j - 1)),
          ));
        }
        previous = current;
      }
      return previous.at(-1)! <= 2;
    }));
  }
  matching.sort((a, b) => {
    const exactA = countryNames(a).includes(normalized);
    const exactB = countryNames(b).includes(normalized);
    return Number(exactB) - Number(exactA) || a.name.localeCompare(b.name);
  });
  return matching.slice(0, 8);
}
