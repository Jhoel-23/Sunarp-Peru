// js/neon-config.js
import { neon } from "https://esm.sh/@neondatabase/serverless";

const DATABASE_URL = "postgresql://neondb_owner:npg_8o3aZknmQBcU@ep-holy-flower-b5iknod9-pooler.c-7.us-east-2.aws.neon.tech/sunarp_db?sslmode=require&channel_binding=require";

export const sql = neon(DATABASE_URL);