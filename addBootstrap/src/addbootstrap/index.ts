//import * as ts from 'typescript';
import {chain, Rule, SchematicContext, SchematicsException, Tree} from '@angular-devkit/schematics';
// import {/*addDeclarationToModule,*/ addImportToModule} from "../schematics-angular-utils/ast-utils";
import { BootstrapOptions } from "./bootstrap-options";
// import * as ts from "typescript";
// import {SourceFile} from "typescript";
// import {Change, InsertChange} from "../schematics-angular-utils/change";
// import {Path} from "@angular-devkit/core";
// import {findModuleFromOptions, ModuleOptions} from "../schematics-angular-utils/find-module";

// function _addToDeclarationsArray(classifiedName: string, importPath: string, options: BootstrapOptions) {
//     return (host: Tree) => {
//         if(options.modulePath === undefined) return host;
//
//         const text = host.read(options.modulePath);
//         if(!text) return host;
//
//         const sourceText = text.toString('utf-8');
//         options.moduleFile = ts.createSourceFile(
//             options.modulePath,
//             sourceText,
//             ts.ScriptTarget.Latest,
//             true
//         );
//
//         let changes = addDeclarationToModule(options.moduleFile, options.modulePath, classifiedName, importPath);
//         applyChanges(host, changes, options.modulePath);
//         return host;
//     }
// }

// Loads the newest version of a source file so that previous writes are not forgotten
// function getSourceFile(host: Tree, options: BootstrapOptions): SourceFile|undefined {
//     if( options.modulePath === undefined ) return undefined;
//     const text = host.read(options.modulePath);
//     if(!text) return undefined;
//
//     const sourceText = text.toString('utf-8');
//     return ts.createSourceFile(
//         options.modulePath,
//         sourceText,
//         ts.ScriptTarget.Latest,
//         true
//     );
// }
//
// // Adds a line to the imports array of a module
// function addToImportsArray(classifiedName: string, importPath: string, options: BootstrapOptions) {
//     return (host: Tree) => {
//         if( options.modulePath === undefined ) return host;
//
//         let moduleFile = getSourceFile(host, options);
//         if( moduleFile === undefined ) return host;
//         else options.moduleFile = moduleFile;
//
//         let changes = addImportToModule(options.moduleFile, options.modulePath, classifiedName, importPath);
//         applyChanges(host, changes, options.modulePath);
//
//         return host;
//     }
// }
//
// // Takes a list of Change objects and inserts them into the file provided by path
// function applyChanges(host: Tree, changes: Change[], path: Path) {
//     let changeRecorder = host.beginUpdate(path);
//     for(let change of changes ) {
//         if (change instanceof InsertChange) {
//             changeRecorder.insertRight(change.pos, change.toAdd);
//         }
//     }
//     host.commitUpdate(changeRecorder);
// }

/*
// How many spaces should be inserted to match the parent element's indentation
function findSpacesString(angularCliFile: SourceFile, stringToFind: string): string {
    let lines = angularCliFile.text.split("\n");
    for(let line of lines) {
        if (line.search(stringToFind) > 0) {
            return Array(line.split(" ").length - 1).join(" ");
        }
    }
    return '';
}

// Check whether a certain string is already present in the sourcefile
function isKeyValueInFile(sourceFile: SourceFile, stringToFind: string) {
    let lines = sourceFile.text.split("\n");
    for(let line of lines) {
        if (line.search(stringToFind) > 0) {
            return true;
        }
    }
    return false;
}
*/



// Adds scripts to the "scripts" collection of an angular-cli.json
// function addScriptsToAngularCli(bootstrapOptions: BootstrapOptions, stringsToAdd:string[]) {
//     return (host: Tree) => {
//         const angularCliPath = bootstrapOptions.modulePath + '/.angular-cli.json';
//         const text = host.read(angularCliPath);
//         if(!text) throw new SchematicsException('Could not find angular-cli.json file');
//
//         let jsonSource = JSON.parse(text.toString('utf-8'));
//
//         if(jsonSource.apps[0].scripts === undefined) {
//             jsonSource.apps[0].scripts = [];
//         }
//         for(let stringToAdd of stringsToAdd) {
//             if(!jsonSource.apps[0].scripts.includes(stringToAdd)) {
//                 jsonSource.apps[0].scripts.push(stringToAdd);
//             }
//         }
//
//         const jsonStr = JSON.stringify(jsonSource, null, 2);
//         host.overwrite(angularCliPath, jsonStr);
//
//         return host;
//     }
// }

function addStylesToAngularCli(bootstrapOptions: BootstrapOptions, stringsToAdd:string[]) {
    return (host: Tree) => {
        const angularCliPath = bootstrapOptions.rootDirPath + '/.angular-cli.json';

        const text = host.read(angularCliPath);
        if(!text) throw new SchematicsException('Could not find the angular-cli.json file');

        let jsonSource = JSON.parse(text.toString('utf-8'));

        if(jsonSource.apps[0].styles === undefined) {
            jsonSource.apps[0].styles = [];
        }
        for(let stringToAdd of stringsToAdd) {
            if(!jsonSource.apps[0].styles.includes(stringToAdd)) {
                jsonSource.apps[0].styles.push(stringToAdd);
            }
        }

        const jsonStr = JSON.stringify(jsonSource, null, 2);
        host.overwrite(angularCliPath, jsonStr);

        return host;
    }
}


// Rule factory called by the schematic addbootstrap
export function addBootstrap(bootstrapOptions: BootstrapOptions): Rule {
    return (host: Tree, context: SchematicContext) => {
        // Find the module file specified in the CLI, app.module.ts on default
        // let moduleOptions: ModuleOptions = {
        //     name: 'app.module.ts',
        //     path: './src/app',
        //     sourceDir: 'src',
        //     moduleFile: undefined,
        //     modulePath: undefined
        // };
        // let modulePath = findModuleFromOptions(host, bootstrapOptions);
        // if( modulePath === undefined ) return host;
        // else bootstrapOptions.modulePath = modulePath;

        // const importPath = '@ng-bootstrap/ng-bootstrap';
        // const classifiedName = 'NgbModule.forRoot()';
        const rule = chain([
            // addToImportsArray(classifiedName, importPath, bootstrapOptions),
            addStylesToAngularCli(bootstrapOptions,[
                "../node_modules/bootstrap/dist/css/bootstrap.min.css"
            ]),
            // addScriptsToAngularCli(bootstrapOptions, [
            //     "node_modules/jquery/dist/jquery.min.js",
            //     "node_modules/bootstrap/dist/js/bootstrap.min.js"
            // ]),
        ]);
        return rule(host, context);
    };
}
/*
let importNode = nodes.find(n => n.kind === ts.SyntaxKind.Decorator);
*/