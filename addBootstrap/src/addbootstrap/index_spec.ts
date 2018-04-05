import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import * as path from 'path';
import { BootstrapOptions } from "./bootstrap-options";

const collectionPath = path.join(__dirname, '../collection.json');

let bootstrapOptions: BootstrapOptions = {name: 'test', rootDirPath:'\.\/mock\-project'};

describe('addBootstrapTest', () => {
  it('Tries to execute the schematic on a project', () => {
     const runner = new SchematicTestRunner('addBootstrap', collectionPath);
     const tree = runner.runSchematic('addbootstrap', bootstrapOptions);
     expect(tree.files).toEqual([]);
  });
});
