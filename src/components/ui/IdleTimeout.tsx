/**
 * IdleTimeout — warns and signs the admin out after inactivity.
 *
 * Tracks mouse, keyboard, scroll, and focus events. Shows a non-blocking
 * banner at WARN_AFTER_MS, force signs out at SIGN_OUT_AFTER_MS.
 *
 * Defaults: warn at 25 min, sign out at 30 min.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const WARN_AFTER_MS     = 25 * 60_000;
const SIGN_OUT_AFTER_MS = 30 * 60_000;

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
    'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart',
];

export default function IdleTimeout() {
    const { user, signOut } = useAuth();
    const [warning, setWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(SECONDS_BETWEEN_WARN_AND_OUT);
    const lastActivity = useRef(Date.now());
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) return;

        function poke() {
            lastActivity.current = Date.now();
            setWarning(false);
        }
        ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, poke, { passive: true }));

        const interval = window.setInterval(() => {
            const idle = Date.now() - lastActivity.current;
            if (idle >= SIGN_OUT_AFTER_MS) {
                void (async () => {
                    await signOut();
                    navigate('/login');
                })();
            } else if (idle >= WARN_AFTER_MS) {
                setWarning(true);
                setSecondsLeft(Math.max(0, Math.ceil((SIGN_OUT_AFTER_MS - idle) / 1000)));
            }
        }, 1000);

        return () => {
            ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, poke));
            window.clearInterval(interval);
        };
    }, [user, signOut, navigate]);

    if (!warning) return null;

    return (
        <div className="idle-banner" role="alert">
            <Clock size={14} />
            <span>
                You've been inactive — you'll be signed out in <strong>{formatTime(secondsLeft)}</strong>.
            </span>
            <button
                type="button"
                className="idle-banner-stay"
                onClick={() => { lastActivity.current = Date.now(); setWarning(false); }}
            >
                I'm here
            </button>
            <button
                type="button"
                className="idle-banner-close"
                onClick={() => setWarning(false)}
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}


const SECONDS_BETWEEN_WARN_AND_OUT = Math.floor((SIGN_OUT_AFTER_MS - WARN_AFTER_MS) / 1000);


function formatTime(secs: number): string {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
}
