import express from "express";
import { log } from "console";
import { setupSwagger } from './swagger';
import * as ipAddress from "ip";
import * as middleware from "./middleware/middleware";
import * as generalRoutes from "./routes/generalRoutes";
import { aboutInformation } from "./common/systemFunctions";



// **** known environment variables

//      TELEMETRY_SERVICE_LOG : boolean     ( determines whether to produce logs )
//      EXPRESS_PORT : number               ( the Web Service's port number )


// **** start up code

// create express application
const app = express();

// setup swagger
setupSwagger(app);

try {
    // populate middleware
    new middleware.CreateMiddleware(app);

    // populate routes
    new generalRoutes.CreateRoutes(app);
    // TODO: add more routes and functionality

} catch {
    // TODO: add an error log here
    // TODO: terminate application
}

// get express port
const port = Number(process.env.EXPRESS_PORT) || 32000;

// start express
app.listen(port, () => {
    log(`\n******** ${aboutInformation.name} v${aboutInformation.version} listening on ${ipAddress.address()}:${port} ********\n`);
});
