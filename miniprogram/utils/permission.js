function can(permissions, key) {
  if (!permissions) return false
  if (Array.isArray(permissions)) return permissions.indexOf(key) >= 0
  return !!permissions[key]
}

module.exports = { can }
