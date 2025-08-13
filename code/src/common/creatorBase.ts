import * as express from "express";


// **** public classes

export abstract class CreatorsBase {

    // ctor 

    constructor(protected app: express.Application) {
        this.create();
    }

    // abstract functions

    protected abstract create(): void;
}
