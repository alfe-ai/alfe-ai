// Migration to fix page_views table column definitions to match session_views table
// This ensures both IPv4 and IPv6 addresses use TEXT[] DEFAULT '{}' consistently

const { RdsStore } = require('./AlfeCode/rds_store');

async function up() {
  console.log('Applying migration: Fix page_views table column definitions');
  
  const rds = new RdsStore();
  await rds.ensureReady();
  
  try {
    // Check and update column types for ipv4_address
    await rds.pool.query(`
      ALTER TABLE page_views
      ALTER COLUMN ipv4_address TYPE TEXT[]
      USING CASE
        WHEN ipv4_address IS NULL OR btrim(ipv4_address::text) = '' THEN '{}'::TEXT[]
        ELSE ARRAY[ipv4_address::text]
      END;
    `);
    
    // Set default value for ipv4_address
    await rds.pool.query(`
      ALTER TABLE page_views
      ALTER COLUMN ipv4_address SET DEFAULT '{}'::TEXT[];
    `);
    
    // Check and update column types for ipv6_address
    await rds.pool.query(`
      ALTER TABLE page_views
      ALTER COLUMN ipv6_address TYPE TEXT[]
      USING CASE
        WHEN ipv6_address IS NULL OR btrim(ipv6_address::text) = '' THEN '{}'::TEXT[]
        ELSE ARRAY[ipv6_address::text]
      END;
    `);
    
    // Set default value for ipv6_address
    await rds.pool.query(`
      ALTER TABLE page_views
      ALTER COLUMN ipv6_address SET DEFAULT '{}'::TEXT[];
    `);
    
    console.log('Migration completed successfully: page_views table column definitions updated');
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Reverting migration: Fix page_views table column definitions');
  // Reversion would require checking exact previous state - in practice,
  // a more complex revert process would be needed
  console.log('Note: This migration is complex to revert, manual intervention might be needed');
}

if (require.main === module) {
  // Run the migration directly when script is executed
  up()
    .then(() => console.log('Migration script completed'))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };