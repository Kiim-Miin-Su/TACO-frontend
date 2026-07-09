import type { AvailabilityOwner, ScheduleResource } from "@/types";
import { countryByCode, KST_TZ, type CountryInfo } from "./tz";

export type ResourceTimezoneKey = `${AvailabilityOwner}:${number}`;
export type ResourceTimezoneOverrides = Partial<Record<ResourceTimezoneKey, CountryInfo | null>>;

export function resourceTimezoneKey(type: AvailabilityOwner, id: number): ResourceTimezoneKey {
  return `${type}:${id}`;
}

export function timezoneCountryFromResource(resource?: ScheduleResource | null): CountryInfo | undefined {
  if (!resource) return undefined;
  const byCountry = countryByCode(resource.countryCode);
  if (byCountry) return byCountry;
  if (resource.timeZone && resource.timeZone !== KST_TZ) {
    return {
      code: resource.timeZone,
      name: resource.timeZone,
      en: resource.timeZone,
      tz: resource.timeZone,
      flag: "🌐",
    };
  }
  return undefined;
}

export function resourceTimezoneOf(
  resource: ScheduleResource | undefined | null,
  overrides: ResourceTimezoneOverrides,
): CountryInfo | undefined {
  if (!resource) return undefined;
  const key = resourceTimezoneKey(resource.type, Number(resource.id));
  if (key in overrides) {
    const override = overrides[key];
    return override && override.tz !== KST_TZ ? override : undefined;
  }
  const country = timezoneCountryFromResource(resource);
  return country && country.tz !== KST_TZ ? country : undefined;
}

export function axisCompanionTimezone(
  columnTimezones: Array<CountryInfo | null | undefined>,
  tableTimezone?: CountryInfo | null,
): CountryInfo | undefined {
  if (tableTimezone && tableTimezone.tz !== KST_TZ) return tableTimezone;
  const unique = new Map<string, CountryInfo>();
  for (const tz of columnTimezones) {
    if (tz && tz.tz !== KST_TZ) unique.set(tz.tz, tz);
  }
  return unique.size === 1 ? Array.from(unique.values())[0] : undefined;
}
