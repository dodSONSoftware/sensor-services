import mariadb = require('mariadb');
import { log } from "../common/systemFunctions";


// **** private variables

const db = mariadb.createPool(
    {
        host: process.env.MARIADB_HOST ?? '192.168.7.102',
        user: process.env.MARIADB_USER ?? 'telemetryuser',
        password: process.env.MARIADB_PASSWORD ?? 'telemetryuser',
        database: process.env.MARIADB_DATABASE ?? 'telemetry',
        connectionLimit: process.env.MARIADB_CONNECTIONLIMIT ? Number(process.env.MARIADB_CONNECTIONLIMIT) : 10
    }
);

// **** public functions

export async function executeSqlQuery(query: string, values?: any): Promise<any> {
    let connection;
    const start = new Date().getTime();

    try {
        // create db connection
        connection = await db.getConnection();

        // execute db query
        const rows = await connection.query(query, values);

        // log it
        const elapsed = new Date().getTime() - start;
        log(JSON.stringify(rows), elapsed);

        // return the rows
        return rows;

    } finally {

        // TODO: be sure to commit, release and end the DB Connection


        // release db connection
        if (connection) {
            connection.release();
        }
    }
}
