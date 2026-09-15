"""Demand prediction with an untouched chronological holdout and recursive inference."""
from datetime import date, timedelta
from typing import Annotated
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestRegressor

app = FastAPI(title="OrderOps Demand Forecast", version="0.1.0")
class Observation(BaseModel):
    day: date
    units: Annotated[int, Field(ge=0, le=100000)]
class Request(BaseModel):
    history: Annotated[list[Observation], Field(min_length=56, max_length=2000)]

def features(values, day):
    return [*values[-7:], float(np.mean(values[-7:])), float(np.mean(values[-14:])), day.weekday()]

def fit(values, start):
    x, y = [], []
    for i in range(14, len(values)):
        x.append(features(values[:i], start+timedelta(days=i)))
        y.append(values[i])
    model=RandomForestRegressor(n_estimators=80, max_depth=6, min_samples_leaf=2, random_state=42, n_jobs=1)
    return model.fit(x, y)

def predict(model, values, start, steps):
    values=list(values); out=[]
    for _ in range(steps):
        p=max(0., float(model.predict([features(values, start+timedelta(days=len(values)))])[0]))
        values.append(p);out.append(p)
    return np.asarray(out)

@app.get('/health')
def health(): return {'status':'ok'}

@app.post('/predict')
def forecast(req: Request):
    history=sorted(req.history, key=lambda x:x.day)
    days=[o.day for o in history]
    if len(set(days))!=len(days) or any(days[i]-days[i-1]!=timedelta(days=1) for i in range(1,len(days))):
        raise HTTPException(422, 'History must contain unique consecutive daily dates, including zero-sales days.')
    if days[-1]>date.today(): raise HTTPException(422,'Future observations are not allowed.')
    values=np.asarray([o.units for o in history],dtype=float)
    train,holdout=values[:-14],values[-14:]
    model=fit(train,days[0]); predicted=predict(model,train,days[0],14)
    baseline=np.asarray([train[-7+i%7] for i in range(14)])
    model_mae=float(np.mean(np.abs(predicted-holdout)));baseline_mae=float(np.mean(np.abs(baseline-holdout)))
    selected='random_forest' if model_mae<baseline_mae else 'seasonal_naive'
    future=predict(fit(values,days[0]),values,days[0],7) if selected=='random_forest' else values[-7:]
    return {'status':'ready','selectedModel':selected,'trainingDays':len(train),'holdoutDays':14,
            'modelMae':round(model_mae,3),'baselineMae':round(baseline_mae,3),
            'evaluation':'14-day chronological holdout; recursive predictions without future inputs. Model selection uses this holdout, so this is a validation result, not an independent test estimate.',
            'forecast':[{'day':str(days[-1]+timedelta(days=i+1)),'units':round(float(p),2)} for i,p in enumerate(future)],
            'historyEnd':str(days[-1]),'staleHistory':(date.today()-days[-1]).days>1,
            'limitation':'Forecasts assume observed sales represent demand. Stockouts, promotions and sparse history can bias results.'}
