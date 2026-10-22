import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { App } from './app';
import { AuthService } from './services/auth.service';
import { LanguageService, SeoService, ThemeService } from './core/services';
import { UserRepository } from './core/services/user.repository';
import { ownerGuard } from './guards/owner.guard';

describe('App', () => {
  const user$ = new Subject<{ uid: string } | null>();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: LanguageService,
          useValue: { init: jasmine.createSpy('init') },
        },
        {
          provide: SeoService,
          useValue: { init: jasmine.createSpy('init') },
        },
        {
          provide: ThemeService,
          useValue: {
            init: jasmine.createSpy('init'),
            setTheme: jasmine.createSpy('setTheme'),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user$,
            getCurrentUser: () => null,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should only request notification permission after a signed-in user exists', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    spyOn(app, 'requestPermission');

    fixture.detectChanges();
    expect(app.requestPermission).not.toHaveBeenCalled();

    user$.next({ uid: 'user-123' });
    expect(app.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('should allow only owners through the owner guard', (done) => {
    const authService = TestBed.inject(AuthService) as any;
    const userRepo = TestBed.inject(UserRepository) as any;
    const router = TestBed.inject((await import('@angular/router')).Router) as any;

    authService.user$ = of({ uid: 'user-123' } as any);
    userRepo.get = jasmine.createSpy('get').and.returnValue(of({ role: 'customer' }));
    spyOn(router, 'navigate');

    ownerGuard().subscribe((result) => {
      expect(result).toBeFalse();
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
      done();
    });
  });
});
