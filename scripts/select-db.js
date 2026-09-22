// Renders prisma/schema.template.prisma -> prisma/schema.prisma for the chosen
// provider, and swaps in the matching migrations history. Run before any
// `prisma generate` / `migrate` / `dev` command. Controlled by DB_PROVIDER
// ("sqlite" | "mysql"), defaulting to sqlite for local development.
const fs = require("fs");
const path = require("path");

const provider = (process.env.DB_PROVIDER || "sqlite").toLowerCase();
if (!["sqlite", "mysql"].includes(provider)) {
  console.error(`Unknown DB_PROVIDER "${provider}". Use "sqlite" or "mysql".`);
  process.exit(1);
}

const root = path.join(__dirname, "..");
const templatePath = path.join(root, "prisma", "schema.template.prisma");
const schemaPath = path.join(root, "prisma", "schema.prisma");
const migrationsDir = path.join(root, "prisma", "migrations");
const providerMigrationsDir = path.join(root, "prisma", `migrations-${provider}`);

// `/*LONGTEXT*/` marks fields that can exceed MySQL's default VARCHAR(191)
// (OAuth tokens, JSON blobs, error traces). MySQL needs @db.Text for these;
// SQLite has no column-length limit and doesn't support @db.Text at all.
const longTextAttr = provider === "mysql" ? "@db.Text" : "";

const template = fs
  .readFileSync(templatePath, "utf8")
  .replace("__PROVIDER__", provider)
  .replace(/\/\*LONGTEXT\*\//g, longTextAttr);
fs.writeFileSync(schemaPath, template);

fs.rmSync(migrationsDir, { recursive: true, force: true });
fs.mkdirSync(providerMigrationsDir, { recursive: true });
fs.cpSync(providerMigrationsDir, migrationsDir, { recursive: true });

console.log(`[db:select] provider=${provider} -> prisma/schema.prisma`);
