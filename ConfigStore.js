.pragma library

var KEYS = [
  "baseUrl", "localUrl", "trustedNetwork", "demoMode", "favorites",
  "demoFavorites", "groupByArea", "showEntityIcons", "selectedTab",
  "displayNameOverrides", "iconOverrides"
]

function stringList(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice()
  var out = []
  var seen = {}
  for (var i = 0; i < value.length; i++) {
    if (typeof value[i] === "string"
        && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(value[i])
        && !seen[value[i]]) {
      seen[value[i]] = true
      out.push(value[i])
    }
  }
  return out
}

function plainMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  var out = {}
  for (var key in value) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue
    if (typeof value[key] === "string") out[key] = value[key]
  }
  return out
}

function parse(text, demoDefaults) {
  var raw = {}
  var error = ""
  try {
    raw = text ? JSON.parse(text) : {}
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      raw = {}
      error = "config.json must contain a JSON object"
    }
  } catch (exception) {
    raw = {}
    error = "config.json is not valid JSON"
  }

  return {
    error: error,
    config: {
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : "",
      // Optional. An alternate address for the same Home Assistant instance
      // — a LAN address, say — tried first, but only on trustedNetwork. It
      // shares baseUrl's credential; it is never a separate keyring origin.
      localUrl: typeof raw.localUrl === "string" ? raw.localUrl : "",
      // The Wi-Fi network name localUrl requires a match against before it is
      // ever tried. See bin/hass-bridge's current_wifi_ssid.
      trustedNetwork: typeof raw.trustedNetwork === "string" ? raw.trustedNetwork : "",
      demoMode: raw.demoMode === true,
      favorites: stringList(raw.favorites, []),
      demoFavorites: stringList(raw.demoFavorites,
                                Array.isArray(demoDefaults) ? demoDefaults : []),
      groupByArea: raw.groupByArea === true,
      showEntityIcons: raw.showEntityIcons !== false,
      selectedTab: typeof raw.selectedTab === "string" && raw.selectedTab
        ? raw.selectedTab : "favorites",
      displayNameOverrides: plainMap(raw.displayNameOverrides),
      iconOverrides: plainMap(raw.iconOverrides)
    }
  }
}

function merge(current, patch) {
  var result = {}
  for (var i = 0; i < KEYS.length; i++) {
    var key = KEYS[i]
    result[key] = current[key]
  }
  for (var p = 0; p < KEYS.length; p++) {
    var patchKey = KEYS[p]
    if (Object.prototype.hasOwnProperty.call(patch || {}, patchKey)) {
      result[patchKey] = patch[patchKey]
    }
  }
  return result
}

function serialize(config) {
  return JSON.stringify(config, null, 2) + "\n"
}
