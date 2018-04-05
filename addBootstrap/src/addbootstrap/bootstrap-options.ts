import {Path} from "@angular-devkit/core";
import {SourceFile} from "typescript";

export interface BootstrapOptions {
    name: string;
    path?: string;
    sourceDir?: string;
    rootDirPath: string;
    moduleFile?: SourceFile;
    modulePath?: Path;
}