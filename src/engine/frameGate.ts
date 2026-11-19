// Keeps capture from queuing stale inference work and discards results after cleanup.
export class FrameGate {
  private active=false;private stopped=false;private generation=0;
  async run<T>(job:()=>Promise<T>,consume:(value:T)=>void,onError:(error:unknown)=>void){
    if(this.active||this.stopped)return false;this.active=true;const generation=this.generation;
    try{const result=await job();if(!this.stopped&&generation===this.generation)consume(result);}
    catch(error){if(!this.stopped&&generation===this.generation)onError(error);}
    finally{this.active=false;}return true;
  }
  get busy(){return this.active;}
  // Keep the backend busy until the old inference settles, but ignore its result or error.
  discardPending(){this.generation++;}
  stop(){this.stopped=true;this.generation++;this.active=false;}
}
