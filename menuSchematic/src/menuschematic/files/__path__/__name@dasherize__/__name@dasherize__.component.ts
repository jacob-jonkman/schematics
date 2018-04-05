import { Component, OnInit } from '@angular/core';
import { MenuItem} from './menu-item';
import { MenuService } from './generated-menu.service';

@Component({
    selector: 'app-<%=dasherize(name)%>',
    templateUrl: '<%=dasherize(name)%>.component.html', // misschien moet dit ./<%=dasherize(name)%> zijn
    styleUrls: ['<%=dasherize(name)%>.component.css'] // misschien moet dit ./<%=dasherize(name)%> zijn
})
export class <%= classify(name)%>Component implements OnInit {
    items: MenuItem[];

    constructor(menuService: MenuService) {
        this.items = menuService.items;
    }

    ngOnInit() {
    }
}
