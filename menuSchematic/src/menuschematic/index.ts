import {apply, chain, mergeWith, move, Rule, Tree, template, url} from '@angular-devkit/schematics';
import { dasherize, classify } from "@angular-devkit/core/src/utils/strings";
import { MenuOptions } from "./menu-options";
import { normalize } from "@angular-devkit/core";
import * as ts from 'typescript';
import * as fs from 'fs';

function toItemList(itemstring: string): string[] {
    return itemstring.split(/, |,/);
}

function addMenuItems(options: MenuOptions, menuItems: string[] | string): Rule {
    let path: string = '';

    let buffer = fs.readFileSync('menu-item.ts');
    let content = buffer.toString('utf-8');
    let node = ts.createSourceFile('menu.ts', content, ts.ScriptTarget.Latest, true);

    return (host: Tree) => {
        path = './src/app/'+options.name+'/';

        if(menuItems.length>0) {
            host.create(path+'menu-item.ts',
            'export class MenuItem {\n' +
                '  name: string;\n' +
                '  link: string;\n' +
            '}\n');

            let content = 'import { MenuItem } from \'./menu-item\';\n\n' +
                'export const ITEMS: MenuItem[] = [\n';
            for (let item of menuItems) {
                content += '  { name: \'' + item + '\', link: \'\' },\n';
                console.log(item);
            }
            content += '];\n';
            host.create(path+'menu-items.ts', content);
        }
        return host;
    };
}

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function generateMenu(options: MenuOptions): Rule {

    options.path = options.path ? normalize(options.path) : options.path;

    const menuItems = options.items ? toItemList(options.items) : options.items;

    const templateSource = apply(url('./files'), [
		template({
            ...options,
            dasherize,
            classify
		}),
        move(options.sourceDir)
    ]);

    return chain([
		addMenuItems(options, menuItems),
        mergeWith(templateSource)
	]);
}
