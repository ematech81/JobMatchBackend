/**
 * Shared paging shape for the admin dashboard's list endpoints — the only
 * place in the app that needs paginated/searchable lists.
 */
function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function paginatedResponse(items, total, { page, limit }) {
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = { parsePagination, paginatedResponse };
