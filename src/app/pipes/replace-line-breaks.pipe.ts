import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'replaceLineBreaks',
    standalone: true
})
export class ReplaceLineBreaksPipe implements PipeTransform {

    transform(value: string | undefined): string {
        if (!value) return '';
        return value.replace(/\n/g, '<br>');
    }

}
