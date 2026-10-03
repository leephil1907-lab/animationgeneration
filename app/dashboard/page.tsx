'use client';

/**
 * Account dashboard.
 *
 * Signup and login previously led nowhere: the forms submitted into a status
 * line. Now a created account lands here, with navigation to every workspace
 * surface and the work recorded on this device.
 *
 * The route is client-guarded: without a session it redirects to /login. Like
 * the rest of the account layer this is device-local demo auth, and the page
 * says so rather than implying a server-side account system.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clapperboard, FolderOpen, LayoutDashboard, LogOut, MessageSquare, Sparkles,
  User, Video, Wand2,
} from 'lucide-react';
import { currentSession, logout, type Session } from '@/lib/auth';
import BrandMark from '@/components/BrandMark';
import { fetchServerJobs, isTerminal, loadJobs, mergeJobs, type MotionaJob } from '@/lib/jobs';
import {
  fetchServerBoards, formatRuntime, loadBoards, mergeBoards, shotProgress, totalRuntime,
  type Storyboard,
} from '@/lib/storyboard';

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [boards, setBoards] = useState<Storyboard[]>([]);
  const [jobs, setJobs] = useState<MotionaJob[]>([]);
  const [synced, setSynced] = useState(false);

  /* ------------------------------------------------------- session guard */
  useEffect(() => {
    const existing = currentSession();
    if (!existing) {
      router.replace('/login');
      return;
    }
    setSession(existing);
    setChecked(true);
  }, [router]);

  const refresh = useCallback(() => {
    const mine = (owner?: string) => !owner || !session || owner === session.email;

    // Paint the browser cache immediately…
    setBoards(loadBoards().filter((board) => mine(board.owner)));
    setJobs(mergeJobs(loadJobs(), []).filter((job) => mine(job.owner)));

    // …then reconcile against the server store, which is the durable record.
    // This is what makes the dashboard survive a cleared browser: re-signing in
    // with the same email restores everything the storage adapter holds.
    void Promise.all([fetchServerBoards(), fetchServerJobs()]).then(([serverBoards, serverJobs]) => {
      setBoards(mergeBoards(loadBoards(), serverBoards).filter((board) => mine(board.owner)));
      setJobs(mergeJobs(loadJobs(), serverJobs).filter((job) => mine(job.owner)));
      setSynced(true);
    });
  }, [session]);

  useEffect(() => {
    if (checked) refresh();
  }, [checked, refresh]);

  const stats = useMemo(() => {
    const completed = jobs.filter((job) => job.status === 'completed').length;
    const inFlight = jobs.filter((job) => !isTerminal(job.status)).length;
    const shots = boards.reduce((sum, board) => sum + board.shots.length, 0);
    const runtime = boards.reduce((sum, board) => sum + totalRuntime(board), 0);
    return { completed, inFlight, shots, runtime };
  }, [jobs, boards]);

  if (!checked || !session) {
    return (
      <main className="productPage">
        <section className="productWrap">
          <div className="empty">
            <Sparkles className="spin" size={20} />
            <p>Checking your session…</p>
          </div>
        </section>
      </main>
    );
  }

  const signOut = () => {
    logout();
    router.replace('/');
  };

  return (
    <main className="productPage">
      <header className="productHeader">
        <Link href="/" className="dashBrand"><BrandMark size={26} /> MOTIONA<i className="studioTag">STUDIO</i></Link>
        <strong>MOTIONA / DASHBOARD</strong>
        <span className="accountChip">
          <User size={12} /> {session.name} · {session.email}
        </span>
      </header>

      <section className="productWrap">
        <div className="productIntro">
          <p className="eyebrow"><LayoutDashboard size={14} /> YOUR STUDIO</p>
          <h1>Welcome back, {session.name.split(' ')[0]}.</h1>
          <p>
            Pick up where you left off. Everything below is the work recorded on this device under
            your local account.
          </p>
        </div>

        <div className="dashTiles">
          <Link className="dashTile" href="/studio">
            <MessageSquare size={19} />
            <b>Studio</b>
            <span>Character lab, chat and voice</span>
          </Link>
          <Link className="dashTile" href="/storyboard">
            <Clapperboard size={19} />
            <b>Storyboard</b>
            <span>Direct shots and render sequences</span>
          </Link>
          <Link className="dashTile" href="/animate">
            <Video size={19} />
            <b>Animate</b>
            <span>Video worker and workflow import</span>
          </Link>
          <Link className="dashTile" href="/gallery">
            <FolderOpen size={19} />
            <b>Gallery</b>
            <span>Preview and download finished renders</span>
          </Link>
        </div>

        <div className="dashStats">
          <div><b>{boards.length}</b><span>sequences</span></div>
          <div><b>{stats.shots}</b><span>shots directed</span></div>
          <div><b>{formatRuntime(stats.runtime)}</b><span>intended runtime</span></div>
          <div><b>{jobs.length}</b><span>jobs</span></div>
          <div><b>{stats.completed}</b><span>completed</span></div>
          <div><b>{stats.inFlight}</b><span>in flight</span></div>
        </div>

        <div className="dashColumns">
          <section className="dashPanel">
            <div className="dashPanelHead">
              <b>Your sequences</b>
              <Link className="textBtn" href="/storyboard">Open storyboard</Link>
            </div>
            {boards.length === 0 ? (
              <p className="dashEmpty">No sequences yet. Create one from the storyboard screen.</p>
            ) : (
              boards.slice(0, 6).map((board) => {
                const progress = shotProgress(board);
                return (
                  <Link className="dashRow" href="/storyboard" key={board.id}>
                    <div>
                      <b>{board.title}</b>
                      <span>
                        {board.shots.length} shots · {formatRuntime(totalRuntime(board))} ·{' '}
                        {progress.complete} complete
                        {progress.failed > 0 && ` · ${progress.failed} failed`}
                      </span>
                    </div>
                    <Wand2 size={14} />
                  </Link>
                );
              })
            )}
          </section>

          <section className="dashPanel">
            <div className="dashPanelHead">
              <b>Recent jobs</b>
              <Link className="textBtn" href="/gallery">Open gallery</Link>
            </div>
            {jobs.length === 0 ? (
              <p className="dashEmpty">No jobs yet. Render a shot and it will appear here.</p>
            ) : (
              jobs.slice(0, 6).map((job) => (
                <Link className="dashRow" href="/gallery" key={job.id}>
                  <div>
                    <b>{job.shotLabel || job.prompt || 'Untitled job'}</b>
                    <span>
                      {job.type} · {job.status}
                      {job.outputs.length > 0 && ` · ${job.outputs.length} output${job.outputs.length === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  <span className={`shotStatus ${job.status === 'completed' ? 'complete' : job.status}`}>{job.status}</span>
                </Link>
              ))
            )}
          </section>
        </div>

        <div className="dashFooter">
          <p className="authDemoNote">
            Local demo account: your profile and session exist only in this browser, so this device
            is the only place you are signed in. Your <b>work</b>, however, is stored server-side in
            the local disk store{synced ? ' (synced)' : ''} — clear the browser and signing back in
            with the same email brings your sequences and jobs with you.
          </p>
          <button className="secondary" onClick={signOut}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
