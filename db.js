// Database module for Supabase integration
// Currently returns null to use local in-memory storage

let supabaseClient = null;

function getSupabase() {
  // For now, return null to use local development mode
  // TODO: Initialize Supabase client when credentials are configured
  return supabaseClient;
}

function setSupabase(client) {
  supabaseClient = client;
}

module.exports = {
  getSupabase,
  setSupabase
};
