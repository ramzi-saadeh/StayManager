import { Directive, ElementRef, Input, OnChanges, Renderer2 } from '@angular/core';

@Directive({
    selector: 'img',
    standalone: true
})
export class OptimizedImageDirective implements OnChanges {
    @Input() src?: string;

    // Default transformations for ImageKit
    private readonly defaultTransform = 'tr=f-auto,q-auto';

    constructor(private el: ElementRef<HTMLImageElement>, private renderer: Renderer2) {
        // Apply lazy loading by default to all images natively
        // Only set it if it's not already intentionally set to eager
        if (!this.el.nativeElement.getAttribute('loading')) {
            this.renderer.setAttribute(this.el.nativeElement, 'loading', 'lazy');
        }
    }

    ngOnChanges(): void {
        this.optimizeImage();
    }

    private optimizeImage(): void {
        if (!this.src) return;

        // Ensure we are working with an ImageKit URL
        if (this.src.includes('ik.imagekit.io')) {
            // Check if the URL already has transformations to avoid duplicating 'tr='
            // If it does, we might need a more complex parsing, but for this project's scope,
            // we'll assume we are adding the standard optimizations.

            let optimizedSrc = this.src;

            // Clean up any existing simple tr params if they exist to apply our standardized ones
            // This is a basic cleanup. If URLs have complex existing params, this might need refinement.
            const urlObj = new URL(this.src);

            // If it doesn't already have f-auto or q-auto, we append our optimized settings.
            // A robust way is to just append if not present, or rewrite the tr parameter.
            if (!urlObj.searchParams.has('tr')) {
                // No transforms exist, simple append
                optimizedSrc = `${this.src}${this.src.includes('?') ? '&' : '?'}${this.defaultTransform},w-800`;
            } else {
                const tr = urlObj.searchParams.get('tr') || '';
                let newTr = tr;
                if (!tr.includes('f-auto')) newTr += ',f-auto';
                if (!tr.includes('q-auto')) newTr += ',q-auto';
                if (!tr.includes('w-')) newTr += ',w-800'; // Default size if not specified

                // Remove leading comma if any
                newTr = newTr.startsWith(',') ? newTr.substring(1) : newTr;

                urlObj.searchParams.set('tr', newTr);
                optimizedSrc = urlObj.toString();
            }

            // Set the optimized src
            this.renderer.setAttribute(this.el.nativeElement, 'src', optimizedSrc);

            // Generate responsive srcset
            // Determine base URL without transformations for srcset generation
            let baseUrl = this.src;
            if (this.src.includes('?')) {
                const url = new URL(this.src);
                url.searchParams.delete('tr');
                baseUrl = url.toString();
            }

            const trPrefix = baseUrl.includes('?') ? '&tr=' : '?tr=';

            const srcset = `
                ${baseUrl}${trPrefix}w-400,f-auto,q-auto 400w,
                ${baseUrl}${trPrefix}w-800,f-auto,q-auto 800w,
                ${baseUrl}${trPrefix}w-1200,f-auto,q-auto 1200w
            `.trim().replace(/\s+/g, ' '); // Clean up formatting

            this.renderer.setAttribute(this.el.nativeElement, 'srcset', srcset);

            // Set standard sizes if not already set
            if (!this.el.nativeElement.getAttribute('sizes')) {
                this.renderer.setAttribute(this.el.nativeElement, 'sizes', '(max-width: 600px) 400px, (max-width: 1000px) 800px, 1200px');
            }
        } else {
            // For non-ImageKit images, just ensure the src is set as originally intended
            this.renderer.setAttribute(this.el.nativeElement, 'src', this.src);
        }
    }
}
