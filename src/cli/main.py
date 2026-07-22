import argparse, sys, os, json, yaml
from pathlib import Path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.pipeline_engine import PipelineEngine, PipelineStep, StepType, Pipeline
from core.universal_loader import UniversalDataLoader

def main():
    parser=argparse.ArgumentParser(description="Data Prep CLI - Full Control")
    parser.add_argument("--input","-i", required=True, help="Input file")
    parser.add_argument("--output","-o", help="Output file")
    parser.add_argument("--pipeline","-p", help="Pipeline config (JSON/YAML)")
    parser.add_argument("--custom-rules","-c", help="Custom rules Python file")
    parser.add_argument("--steps","-s", nargs="+", help="Steps to execute")
    parser.add_argument("--params", help="Step params as JSON")
    parser.add_argument("--export-pipeline", help="Export pipeline to file")
    parser.add_argument("--dry-run", action="store_true", help="Show steps only")
    parser.add_argument("--verbose","-v", action="store_true")
    args=parser.parse_args()
    engine=PipelineEngine(); loader=UniversalDataLoader()
    print(f"Loading {args.input}...")
    data=loader.load(args.input)
    df=data.get('data', data)
    print(f"Loaded: {len(df)} rows, {len(df.columns)} columns" if hasattr(df,'shape') else "Loaded")
    pipeline=None
    if args.pipeline:
        with open(args.pipeline,'r') as f:
            config=json.load(f) if args.pipeline.endswith('.json') else yaml.safe_load(f)
        pipeline=engine.import_pipeline(config)
        print(f"Loaded pipeline: {pipeline.name}")
    elif args.steps:
        pipeline=Pipeline(name="cli_pipeline")
        params=json.loads(args.params) if args.params else {}
        for step_name in args.steps:
            if step_name in engine.builtin_functions:
                step=PipelineStep(id=f"step_{step_name}", name=step_name, type=StepType.CLEANING,
                                  function=engine.builtin_functions[step_name],
                                  parameters=params.get(step_name, {}))
                pipeline.add_step(step)
            else: print(f"Warning: Step '{step_name}' not found")
        engine.load_pipeline(pipeline)
        print(f"Created pipeline with {len(pipeline.steps)} steps")
    else:
        print("No pipeline specified"); return
    if args.custom_rules:
        print(f"Loading custom rules from {args.custom_rules}...")
        with open(args.custom_rules,'r') as f:
            code=f.read()
        local={}
        exec(code, globals(), local)
        for n,obj in local.items():
            if callable(obj):
                engine.add_custom_function(n, obj, "Custom rule")
                print(f"Registered custom function: {n}")
    if args.export_pipeline:
        exp=engine.export_pipeline(pipeline.name)
        with open(args.export_pipeline,'w') as f: json.dump(exp, f, indent=2)
        print(f"Exported to {args.export_pipeline}")
        if args.dry_run: return
    if args.dry_run:
        print("\nPipeline steps:")
        for i,s in enumerate(pipeline.steps):
            print(f"  {i+1}. {s.name} - {s.type.value}")
            if s.parameters: print(f"     Params: {s.parameters}")
            if s.condition: print(f"     Condition: {s.condition}")
        return
    print("\nExecuting pipeline...")
    result=engine.execute_pipeline(pipeline.name, df)
    if result['errors']:
        print(f"\n⚠️ Errors: {len(result['errors'])}")
        for e in result['errors']: print(f"  ❌ {e}")
    if result['warnings']:
        print(f"\n⚠️ Warnings: {len(result['warnings'])}")
        for w in result['warnings']: print(f"  ⚠️ {w}")
    print(f"\n✅ Executed {len(result['history'])} steps")
    if args.output and isinstance(result['data'], pd.DataFrame):
        result['data'].to_csv(args.output, index=False)
        print(f"Saved to {args.output}")
    if args.verbose and isinstance(result['data'], pd.DataFrame):
        print("\nData preview:\n", result['data'].head())
if __name__=="__main__": main()
