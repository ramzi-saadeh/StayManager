import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Firestore } from '@angular/fire/firestore';
import { ImageKitService } from '@imagekit/angular';
import { WorkspaceService } from './workspace.service';
import { AuthService } from '../../services/auth.service';
import { CloudFunctionService } from './cloud-function.service';

describe('WorkspaceService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkspaceService,
        { provide: Firestore, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            user$: of(null),
            getCurrentUser: () => null,
          },
        },
        {
          provide: CloudFunctionService,
          useValue: {
            call: () => Promise.resolve({ success: false, code: 'INTERNAL_ERROR', message: 'Not configured' }),
          },
        },
        { provide: ImageKitService, useValue: { upload: () => Promise.resolve({ url: 'https://ik.imagekit.io/demo/logo.png' }) } },
      ],
    });
  });

  it('should normalize and return a usable workspace logo url', () => {
    const service = TestBed.inject(WorkspaceService);

    expect(service.workspaceLogoUrl({ logoUrl: 'https://ik.imagekit.io/demo/logo.png' } as any)).toBe(
      'https://ik.imagekit.io/demo/logo.png',
    );
    expect(service.workspaceLogoUrl({ logoUrl: '   ' } as any)).toBeNull();
    expect(service.workspaceLogoUrl(null)).toBeNull();
  });
});
