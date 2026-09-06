const Job = require('../models/Job');

/**
 * Jobs are addressable by either JSearch's external `job_id` or our Mongo
 * `_id`, so any route taking a jobId param should accept both. Only treat
 * the param as an ObjectId when it structurally is one — otherwise Mongoose
 * throws a CastError instead of just not matching.
 */
function findJobByEitherId(id = '') {
  const or = [{ job_id: id }];
  if (/^[0-9a-fA-F]{24}$/.test(id)) or.push({ _id: id });
  return Job.findOne({ $or: or });
}

module.exports = findJobByEitherId;
